import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import prisma from '~~/lib/prisma';
import { logger } from '~~/server/utils/logger';
import { prepareAssets, releaseUnreferencedAssets } from './file-assets';
import { applyFileChanges, toProjectPath, type FileChange } from './file-changes';
import { observer } from './achievement';
import { findLabTemplate, listLabTemplates } from './lab-template';

/**
 * 实验室项目：用户从模板创建、长期保存在服务端的个人项目。
 * 文件存储复用做题项目的 FileSystems / VirtualFiles / FileAsset，
 * 区别在于文件系统挂在 LabProject 上，且有项目级的空间配额。
 */

export const getLabLimits = () => useRuntimeConfig().public.lab;

const PROJECT_ROOT = '/project';

const formatMB = (bytes: number | bigint) =>
   `${(Number(bytes) / 1024 / 1024).toFixed(1)}MB`;

/** 不允许写入的路径：依赖与构建产物可以随时重新生成，不占用项目空间 */
const isIgnoredPath = (path: string) =>
   /(^|\/)(node_modules|\.git)(\/|$)/.test(path);

/** 校验并规范化客户端传入的项目内路径（统一为 /project/...） */
export const normalizeLabFilePath = (raw: string) => {
   if (!raw || raw.length > 1024 || raw.includes('\0')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '非法的文件路径' });
   }
   const path = toProjectPath(raw.replace(/\\/g, '/'));
   const segments = path.split('/').slice(2);
   if (
      segments.length === 0 ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
   ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '非法的文件路径' });
   }
   if (isIgnoredPath(path)) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: 'node_modules 与 .git 目录不会保存到项目中',
      });
   }
   return path;
};

const normalizeChange = (change: FileChange): FileChange => {
   if (change.type === 'mv') {
      return {
         ...change,
         oldPath: normalizeLabFilePath(change.oldPath),
         newPath: normalizeLabFilePath(change.newPath),
      };
   }
   return { ...change, path: normalizeLabFilePath(change.path) };
};

/** 统计文件系统占用（文本按 UTF-8 字节数，二进制按资产大小） */
const computeFileSystemSize = async (
   tx: Prisma.TransactionClient,
   fileSystemId: string,
) => {
   const [row] = await tx.$queryRaw<{ size: bigint }[]>`
      SELECT COALESCE(SUM(COALESCE(octet_length(vf.content), 0) + COALESCE(fa."sizeBytes", 0)), 0)::bigint AS size
      FROM virtual_files vf
      LEFT JOIN file_assets fa ON fa.id = vf."assetId"
      WHERE vf."fileSystemFsid" = ${fileSystemId}
   `;
   return row?.size ?? 0n;
};

const templateFiles = async (
   templateId: string,
   options: { requireEnabled: boolean },
) => {
   const template = await findLabTemplate(templateId);
   if (!template) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '模板不存在或已被删除' });
   }
   if (options.requireEnabled && !template.enabled) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '该模板已停用' });
   }
   return Object.entries(template.files).map(([relative, content]) => ({
      path: `${PROJECT_ROOT}/${relative}`,
      content,
   }));
};

/** 锁定项目行并返回（不存在或不属于该用户时抛出 NOT_FOUND） */
const lockProject = async (
   tx: Prisma.TransactionClient,
   userId: string,
   projectId: string,
) => {
   const [project] = await tx.$queryRaw<
      { id: string; revision: number; templateId: string }[]
   >`
      SELECT id, revision, "templateId" FROM lab_projects
      WHERE id = ${projectId} AND "ownerId" = ${userId}
      FOR UPDATE
   `;
   if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
   }
   return project;
};

const list = async (userId: string) => {
   const [projects, templates] = await Promise.all([
      prisma.labProject.findMany({
         where: { ownerId: userId },
         orderBy: { updatedAt: 'desc' },
         select: {
            id: true,
            name: true,
            description: true,
            templateId: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
            lastOpenedAt: true,
            fileSystem: { select: { _count: { select: { files: true } } } },
         },
      }),
      listLabTemplates({ includeDisabled: true }),
   ]);
   const templateMap = new Map(templates.map((template) => [template.id, template]));
   return projects.map(({ fileSystem, sizeBytes, ...project }) => {
      const template = templateMap.get(project.templateId);
      return {
         ...project,
         sizeBytes: Number(sizeBytes),
         fileCount: fileSystem?._count.files ?? 0,
         /** 模板被删除时为 null */
         template: template ? { name: template.name, icon: template.icon } : null,
      };
   });
};

const create = async (options: {
   userId: string;
   templateId: string;
   name: string;
   description?: string;
}) => {
   const { maxProjectsPerUser } = getLabLimits();
   const files = await templateFiles(options.templateId, { requireEnabled: true });
   const sizeBytes = files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content),
      0,
   );

   const project = await prisma.$transaction(async (tx) => {
      // 串行化同一用户的创建请求，保证数量上限不被并发穿透
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lab-create:${options.userId}`}, 0))`;
      const count = await tx.labProject.count({
         where: { ownerId: options.userId },
      });
      if (count >= maxProjectsPerUser) {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: `每位用户最多创建 ${maxProjectsPerUser} 个项目，请先删除不再需要的项目`,
         });
      }
      const created = await tx.labProject.create({
         data: {
            ownerId: options.userId,
            name: options.name,
            description: options.description || null,
            templateId: options.templateId,
            sizeBytes: BigInt(sizeBytes),
            fileSystem: { create: { ownerId: options.userId } },
         },
         select: { id: true, fileSystem: { select: { fsid: true } } },
      });
      await tx.virtualFiles.createMany({
         data: files.map((file) => ({
            path: file.path,
            content: file.content,
            ownerId: options.userId,
            fileSystemFsid: created.fileSystem!.fsid,
         })),
      });
      return created;
   });
   observer.manualMarkDirty(['file_systems', 'virtual_files']);
   return { id: project.id };
};

/** 读取项目及其文件：文本文件直接返回内容，二进制文件只返回资产 id，由客户端按需下载 */
const get = async (userId: string, projectId: string) => {
   const project = await prisma.labProject.findFirst({
      where: { id: projectId, ownerId: userId },
      include: {
         fileSystem: {
            select: {
               files: {
                  select: {
                     path: true,
                     content: true,
                     assetId: true,
                     asset: { select: { sizeBytes: true } },
                  },
               },
            },
         },
      },
   });
   if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
   }
   // 只记录打开时间，不改动 updatedAt（列表按最近修改排序）
   await prisma.$executeRaw`UPDATE lab_projects SET "lastOpenedAt" = NOW() WHERE id = ${projectId}`;
   // 已停用的模板仍按其配置启动；模板被删除时为 null，由 IDE 按项目内容推断启动方式
   const template = await findLabTemplate(project.templateId);

   const { fileSystem, sizeBytes, ...meta } = project;
   return {
      project: { ...meta, sizeBytes: Number(sizeBytes) },
      template: template
         ? {
              id: template.id,
              name: template.name,
              description: template.description,
              entry: template.entry,
              installCommand: template.installCommand ?? '',
              startCommand: template.startCommand,
              readme: template.readme,
              snapshotImageId: template.snapshotImageId,
              snapshotImage: template.snapshotImage,
           }
         : null,
      files: (fileSystem?.files ?? []).map((file) => ({
         path: toProjectPath(file.path),
         content: file.content,
         assetId: file.assetId,
         sizeBytes: file.asset
            ? Number(file.asset.sizeBytes)
            : Buffer.byteLength(file.content ?? ''),
      })),
   };
};

const update = async (
   userId: string,
   projectId: string,
   data: { name?: string; description?: string | null },
) => {
   const result = await prisma.labProject.updateMany({
      where: { id: projectId, ownerId: userId },
      data,
   });
   if (result.count === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
   }
};

/** 文件系统当前引用的资产 id（变更提交后用于回收不再被引用的资产） */
const listAssetIds = async (
   client: Prisma.TransactionClient,
   labProjectId: string,
) => {
   const files = await client.virtualFiles.findMany({
      where: { FileSystem: { labProjectId }, assetId: { not: null } },
      select: { assetId: true },
   });
   return files.map((file) => file.assetId!);
};

const remove = async (userId: string, projectId: string) => {
   const assetIds = await listAssetIds(prisma, projectId);
   // 文件系统与虚拟文件随项目级联删除
   const result = await prisma.labProject.deleteMany({
      where: { id: projectId, ownerId: userId },
   });
   if (result.count === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '项目不存在' });
   }
   observer.manualMarkDirty(['file_systems', 'virtual_files']);
   await releaseUnreferencedAssets(assetIds);
};

/** 把一批文件变更写入项目，写入后重新统计空间占用，超出配额则整体回滚 */
const sync = async (options: {
   userId: string;
   projectId: string;
   revision?: number;
   changes: FileChange[];
}) => {
   const { userId, projectId, revision } = options;
   if (options.changes.length === 0) {
      return { processedCount: 0, sizeBytes: null as number | null };
   }
   const { maxChangesPerSync } = useRuntimeConfig().fileSync;
   if (options.changes.length > maxChangesPerSync) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `单次同步最多 ${maxChangesPerSync} 项变更`,
      });
   }
   const { maxProjectBytes } = getLabLimits();
   // node_modules / .git 内的变更静默跳过（客户端本应过滤），避免整批正常改动被拒绝
   const changes = options.changes
      .filter((change) =>
         change.type === 'mv'
            ? !isIgnoredPath(change.oldPath) && !isIgnoredPath(change.newPath)
            : !isIgnoredPath(change.path),
      )
      .map(normalizeChange);
   if (changes.length === 0) {
      return { processedCount: 0, sizeBytes: null as number | null };
   }

   const writes = changes.flatMap((change) =>
      change.type === 'change' || change.type === 'create' ? [change] : [],
   );
   const assets = await prepareAssets(writes, userId, {
      deferExistingVerification: true,
   });
   let committed = false;
   /** 变更前引用的资产：被覆盖 / 删除后若不再被引用则回收 */
   let previousAssetIds: string[] = [];
   try {
      const sizeBytes = await prisma.$transaction(async (tx) => {
         const locked = await lockProject(tx, userId, projectId);
         if (revision !== undefined && locked.revision !== revision) {
            throw new TRPCError({
               code: 'CONFLICT',
               message: '项目已被重置，请刷新页面',
            });
         }
         const fileSystem = await tx.fileSystems.findUnique({
            where: { labProjectId: projectId },
            include: { files: { include: { asset: true } } },
         });
         if (!fileSystem) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '项目文件系统不存在' });
         }
         previousAssetIds = fileSystem.files.flatMap((file) =>
            file.assetId ? [file.assetId] : [],
         );
         const preparedWrites = await assets.bind(tx, {
            reusableAssets: fileSystem.files.flatMap((file) =>
               file.asset ? [file.asset] : [],
            ),
         });
         await applyFileChanges(tx, {
            userId,
            fileSystemId: fileSystem.fsid,
            files: fileSystem.files,
            changes,
            preparedWrites,
         });

         const size = await computeFileSystemSize(tx, fileSystem.fsid);
         if (size > BigInt(maxProjectBytes)) {
            throw new TRPCError({
               code: 'PAYLOAD_TOO_LARGE',
               message: `项目空间不足：上限 ${formatMB(maxProjectBytes)}，写入后将占用 ${formatMB(size)}`,
            });
         }
         await tx.labProject.update({
            where: { id: projectId },
            data: { sizeBytes: size },
         });
         return Number(size);
      });
      committed = true;
      observer.manualMarkDirty(['virtual_files']);
      if (changes.some((change) => change.type !== 'mv')) {
         await releaseUnreferencedAssets(previousAssetIds);
      }
      return { processedCount: changes.length, sizeBytes };
   } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error({ error, projectId }, 'Failed to sync lab project changes');
      throw new TRPCError({
         code: 'INTERNAL_SERVER_ERROR',
         message: error instanceof Error ? error.message : '同步失败',
      });
   } finally {
      await assets.cleanup(committed);
   }
};

/** 重置为模板初始文件：清空现有文件、递增版本号，使重置前发出的同步请求失效 */
const reset = async (userId: string, projectId: string) => {
   let previousAssetIds: string[] = [];
   await prisma.$transaction(async (tx) => {
      const locked = await lockProject(tx, userId, projectId);
      // 已停用的模板仍允许重置，只有模板被删除时才无法重置
      const files = await templateFiles(locked.templateId, { requireEnabled: false });
      previousAssetIds = await listAssetIds(tx, projectId);
      const fileSystem = await tx.fileSystems.findUniqueOrThrow({
         where: { labProjectId: projectId },
         select: { fsid: true },
      });
      await tx.virtualFiles.deleteMany({
         where: { fileSystemFsid: fileSystem.fsid },
      });
      await tx.virtualFiles.createMany({
         data: files.map((file) => ({
            path: file.path,
            content: file.content,
            ownerId: userId,
            fileSystemFsid: fileSystem.fsid,
         })),
      });
      await tx.labProject.update({
         where: { id: projectId },
         data: {
            revision: { increment: 1 },
            sizeBytes: BigInt(
               files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0),
            ),
         },
      });
   });
   observer.manualMarkDirty(['virtual_files']);
   await releaseUnreferencedAssets(previousAssetIds);
};

export const labProjectService = {
   list,
   create,
   get,
   update,
   remove,
   sync,
   reset,
};
