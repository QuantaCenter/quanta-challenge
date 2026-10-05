import z from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import prisma from '~~/lib/prisma';
import { router } from '../../trpc';
import { TRPCError } from '@trpc/server';
import { observer } from '../../services/achievement';
import { logger } from '~~/lib/logger';

// 定义变更类型的 schema
const ChangeSchema = z.discriminatedUnion('type', [
   z.object({
      type: z.literal('rm'),
      path: z.string(),
   }),
   z.object({
      type: z.literal('mv'),
      oldPath: z.string(),
      newPath: z.string(),
   }),
   z.object({
      type: z.literal('change'),
      path: z.string(),
      content: z.string(),
   }),
   z.object({
      type: z.literal('create'),
      path: z.string(),
      content: z.string(),
   }),
]);

const SyncFileChangesSchema = z.object({
   problemId: z.number(),
   changes: z.array(ChangeSchema),
});

const PROJECT_ROOT_PATH = '/project';

/**
 * 把数据库里的虚拟文件路径归一化为 `/project/...`。
 *
 * 历史数据同时存在两种写法：相对路径 `index.html` 与已带项目根的
 * `/project/index.html`。同步时客户端只会发 `/project/...`，若不做归一化，
 * 第二种写法会被拼成 `/project//project/...` 而匹配不上，导致每次编辑都
 * 新建一条重复记录（旧记录残留），文件树里出现 project/project 两层。
 */
const toProjectPath = (path: string): string => {
   const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/+$/, '');
   if (
      normalized === PROJECT_ROOT_PATH ||
      normalized.startsWith(`${PROJECT_ROOT_PATH}/`)
   ) {
      return normalized;
   }
   return `${PROJECT_ROOT_PATH}${normalized}`;
};

/**
 * 同步文件变更到服务器
 * 处理文件的创建、修改、移动和删除操作
 */
const syncFileChangesProcedure = protectedProcedure
   .input(SyncFileChangesSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId, changes } = input;

      if (changes.length === 0) {
         return { success: true, processedCount: 0 };
      }

      const { maxChangesPerSync } = useRuntimeConfig().fileSync;
      if (changes.length > maxChangesPerSync) {
         logger.error(
            {
               count: changes.length,
               changes,
               traceId: ctx.traceId ?? 'unknown',
            },
            `Too many changes in one sync`,
         );
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Too many changes in one sync. Maximum allowed is ${maxChangesPerSync}.`,
         });
      }

      try {
         await prisma.$transaction(async (tx) => {
            // 获取用户的项目和文件系统
            const project = await tx.projects.findFirst({
               where: {
                  ownerId: userId,
                  problemId: problemId,
               },
               include: {
                  FileSystem: {
                     include: {
                        files: true,
                     },
                  },
               },
            });

            if (!project || !project.FileSystem[0]) {
               throw new TRPCError({
                  code: 'NOT_FOUND',
                  message: 'Project or file system not found',
               });
            }

            const fileSystemId = project.FileSystem[0].fsid;
            const existingFiles = new Map(
               project.FileSystem[0].files.map((f) => [
                  toProjectPath(f.path),
                  f,
               ]),
            );

            // 处理每个变更
            for (const change of changes) {
               switch (change.type) {
                  case 'rm': {
                     // 删除文件或文件夹
                     const file = existingFiles.get(change.path);
                     if (file) {
                        // 是一个具体文件，直接删除
                        await tx.virtualFiles.delete({
                           where: { vid: file.vid },
                        });
                        existingFiles.delete(change.path);
                        logger.debug({ file }, 'Remove file');
                        break;
                     }

                     // 可能是文件夹，删除所有匹配前缀的文件
                     const folderPrefix = change.path.endsWith('/')
                        ? change.path
                        : change.path + '/';
                     const filesToDelete: string[] = [];

                     for (const [filePath, fileData] of existingFiles) {
                        if (filePath.startsWith(folderPrefix)) {
                           filesToDelete.push(fileData.vid);
                        }
                     }
                     // 批量删除文件夹内的所有文件
                     if (filesToDelete.length > 0) {
                        await tx.virtualFiles.deleteMany({
                           where: {
                              vid: { in: filesToDelete },
                           },
                        });
                        // 从缓存中移除
                        for (const [filePath] of existingFiles) {
                           if (filePath.startsWith(folderPrefix)) {
                              existingFiles.delete(filePath);
                           }
                        }
                        logger.debug(
                           {
                              path: change.path,
                              traceId: ctx.traceId ?? 'unknown',
                           },
                           'Remove folder',
                        );
                     }
                     break;
                  }

                  case 'mv': {
                     // 移动/重命名文件
                     const file = existingFiles.get(change.oldPath);

                     // 移动文件
                     if (file) {
                        // 统一存为 /project/... 形式
                        const newPath = toProjectPath(change.newPath);
                        await tx.virtualFiles.update({
                           where: { vid: file.vid },
                           data: { path: newPath },
                        });
                        existingFiles.delete(change.oldPath);
                        existingFiles.set(newPath, {
                           ...file,
                           path: newPath,
                        });
                        logger.debug(
                           {
                              oldPath: change.oldPath,
                              newPath: change.newPath,
                              traceId: ctx.traceId ?? 'unknown',
                           },
                           'Move file',
                        );
                        break;
                     }

                     // 移动文件夹，更新所有匹配前缀的文件路径
                     const oldFolderPrefix = change.oldPath.endsWith('/')
                        ? change.oldPath
                        : change.oldPath + '/';
                     const newFolderPrefix = change.newPath.endsWith('/')
                        ? change.newPath
                        : change.newPath + '/';

                     for (const [filePath, fileData] of existingFiles) {
                        if (filePath.startsWith(oldFolderPrefix)) {
                           const relativePath = filePath.slice(
                              oldFolderPrefix.length,
                           );
                           const updatedPath = newFolderPrefix + relativePath;
                           const newDbPath = toProjectPath(updatedPath);

                           await tx.virtualFiles.update({
                              where: { vid: fileData.vid },
                              data: { path: newDbPath },
                           });
                           existingFiles.delete(filePath);
                           existingFiles.set(newDbPath, {
                              ...fileData,
                              path: newDbPath,
                           });
                        }
                     }
                     logger.debug(
                        {
                           oldPath: change.oldPath,
                           newPath: change.newPath,
                           traceId: ctx.traceId ?? 'unknown',
                        },
                        'Move folder',
                     );
                     break;
                  }

                  case 'change': {
                     // 更新文件内容
                     const file = existingFiles.get(change.path);
                     if (file) {
                        await tx.virtualFiles.update({
                           where: { vid: file.vid },
                           data: { content: change.content },
                        });
                     } else {
                        // 如果文件不存在，创建它
                        const newPath = toProjectPath(change.path);
                        const newFile = await tx.virtualFiles.create({
                           data: {
                              path: newPath,
                              content: change.content,
                              ownerId: userId,
                              fileSystemFsid: fileSystemId,
                           },
                        });
                        existingFiles.set(newPath, newFile);
                     }
                     break;
                  }

                  case 'create': {
                     // 创建新文件
                     const existingFile = existingFiles.get(change.path);
                     if (!existingFile) {
                        const newPath = toProjectPath(change.path);
                        const newFile = await tx.virtualFiles.create({
                           data: {
                              path: newPath,
                              content: change.content,
                              ownerId: userId,
                              fileSystemFsid: fileSystemId,
                           },
                        });
                        existingFiles.set(newPath, newFile);
                     } else {
                        // 如果文件已存在，更新内容
                        await tx.virtualFiles.update({
                           where: { vid: existingFile.vid },
                           data: { content: change.content },
                        });
                     }
                     break;
                  }
               }
            }
         });

         // 标记缓存失效
         observer.manualMarkDirty(['virtual_files']);

         return {
            success: true,
            processedCount: changes.length,
         };
      } catch (error) {
         logger.error(
            { error, traceId: ctx.traceId ?? 'unknown' },
            'Failed to sync file changes',
         );
         throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
               error instanceof Error
                  ? error.message
                  : 'Failed to sync file changes',
         });
      }
   });

export const fileSyncRouter = router({
   syncFileChanges: syncFileChangesProcedure,
});
