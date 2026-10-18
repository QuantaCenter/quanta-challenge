import prisma from '~~/lib/prisma';
import { Prisma, PrismaClient, VirtualFiles } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { TRPCError } from '@trpc/server';
import { observer } from './achievement';

type Tx = Omit<
   PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
   '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface IFile {
   name: string;
   path: string;
   content: string;
}

export interface ICreateProjectOptions {
   fs: IFile[];
   isTemplate: boolean;
   userId: string;
   problemId: number;
   projectName?: string;
   tx?: Tx;
}

/** 创建一个新项目，返回项目 ID、文件系统 ID 和虚拟文件 ID 列表。 */
const create = async (options: ICreateProjectOptions) => {
   const result = {
      projectId: '',
      fileSystemId: '',
      virtualFileIds: [] as string[],
   };

   const doTransaction = async (tx: Tx) => {
      // Create the project
      const project = await tx.projects.create({
         data: {
            isTemplate: options.isTemplate,
            name: options.projectName || `Project-${Date.now()}`,
            owner: {
               connect: {
                  id: options.userId,
               },
            },
            problem: {
               connect: {
                  pid: options.problemId,
               },
            },
         },
         select: {
            pid: true,
         },
      });
      result.projectId = project.pid;

      // Create the file system for the project
      const fileSystem = await tx.fileSystems.create({
         data: {
            ownerId: options.userId,
            projectId: project.pid,
         },
         select: {
            fsid: true,
         },
      });
      result.fileSystemId = fileSystem.fsid;

      // Create the virtual files in the file system
      await tx.virtualFiles.createMany({
         data: options.fs.map(
            (file) =>
               ({
                  path: file.path,
                  content: file.content,
                  ownerId: options.userId,
                  fileSystemFsid: fileSystem.fsid,
               } satisfies Omit<
                  VirtualFiles,
                  'vid' | 'createdAt' | 'updatedAt'
               >)
         ),
      });

      const vids = await tx.virtualFiles.findMany({
         where: {
            fileSystemFsid: result.fileSystemId,
         },
         select: {
            vid: true,
         },
      });
      result.virtualFileIds = vids.map((v) => v.vid);
   };
   observer.manualMarkDirty(['projects', 'file_systems', 'virtual_files']);

   if (options.tx) {
      await doTransaction(options.tx);
   } else {
      await prisma.$transaction(doTransaction);
   }

   return result;
};

export interface IForkProjectOptions {
   projectId: string;
   userId: string;
   problemId?: number;
   projectName?: string;
   isTemplate?: boolean;
   tx?: Tx;
}

/** 克隆一个项目，返回项目 ID、文件系统 ID 和虚拟文件 ID 列表。 */
const fork = async (options: IForkProjectOptions) => {
   const result = {
      projectId: '',
      fileSystemId: '',
      virtualFileIds: [] as string[],
   };

   const doTransaction = async (tx: Tx) => {
      // 创建新项目，返回项目ID
      const newProjectResult = await tx.$queryRaw<{ pid: string }[]>`
         INSERT INTO projects (pid, "isTemplate", name, "ownerId", "problemId", "createdAt", "updatedAt")
         SELECT 
            gen_random_uuid(),
            COALESCE(${options.isTemplate}, "isTemplate"), 
            COALESCE(${options.projectName}, 'Project-' || EXTRACT(EPOCH FROM NOW())), 
            ${options.userId}, 
            COALESCE(${options.problemId}, "problemId"),
            NOW(),
            NOW()
         FROM projects
         WHERE pid = ${options.projectId}
         RETURNING pid
      `;

      if (!newProjectResult || newProjectResult.length === 0) {
         throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message:
               'Failed to create new project or original project not found',
         });
      }

      const newProjectId = newProjectResult[0].pid;
      result.projectId = newProjectId;

      // 创建新文件系统
      const newFileSystem = await tx.fileSystems.create({
         data: {
            ownerId: options.userId,
            projectId: newProjectId,
         },
         select: {
            fsid: true,
         },
      });
      const newFileSystemId = newFileSystem.fsid;
      result.fileSystemId = newFileSystemId;

      // 克隆虚拟文件到新文件系统
      await tx.$executeRaw`
         INSERT INTO "virtual_files" (vid, path, content, "ownerId", "fileSystemFsid", "createdAt", "updatedAt")
         SELECT 
            gen_random_uuid() AS vid,
            path, 
            content, 
            ${options.userId}, 
            ${newFileSystemId},
            NOW(),
            NOW()
         FROM "virtual_files"
         WHERE "fileSystemFsid" = (
            SELECT fsid
            FROM "file_systems"
            WHERE "projectId" = ${options.projectId}
         )
      `;
      const vids = await tx.virtualFiles.findMany({
         where: {
            fileSystemFsid: result.fileSystemId,
         },
         select: {
            vid: true,
         },
      });
      result.virtualFileIds = vids.map((v) => v.vid);
   };
   observer.manualMarkDirty(['projects', 'file_systems', 'virtual_files']);

   if (options.tx) {
      await doTransaction(options.tx);
   } else {
      await prisma.$transaction(doTransaction);
   }

   return result;
};

export const projectService = {
   create,
   fork,
};
