import z from 'zod';
import type { Prisma, VirtualFiles } from '@prisma/client';
import { decodeSnapshotContent } from '@challenge/shared/snapshot-content';
import { logger } from '~~/server/utils/logger';

/**
 * 文件系统增量变更（创建 / 修改 / 移动 / 删除）的公共实现。
 * 做题项目（file-sync）与实验室项目（lab）共用，二者只在"如何定位并锁定项目"上不同。
 */

const movedContent = (file: { path: string; content: string | null }) => {
   if (file.content === null || file.content.startsWith('data:')) return file.content;
   const decoded = decodeSnapshotContent(file.path, file.content);
   return typeof decoded === 'string'
      ? file.content
      : `data:application/octet-stream;base64,${Buffer.from(decoded).toString('base64')}`;
};

// 文本列不能存储 NUL 字节，含 \u0000 的内容直接拒绝
const SyncContentSchema = z
   .string()
   .refine((content) => !content.includes('\u0000'), {
      error: '内容包含非法字符',
   });

export const FileChangeSchema = z.discriminatedUnion('type', [
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
      content: SyncContentSchema,
   }),
   z.object({
      type: z.literal('create'),
      path: z.string(),
      content: SyncContentSchema,
   }),
]);

export type FileChange = z.infer<typeof FileChangeSchema>;

const PROJECT_ROOT_PATH = '/project';

/** 把数据库里的虚拟文件路径归一化为 `/project/...`：历史数据含相对路径写法，不归一化会导致每次编辑新建重复记录。 */
export const toProjectPath = (path: string): string => {
   const normalized = `/${path}`.replace(/\/+/g, '/').replace(/\/+$/, '');
   if (
      normalized === PROJECT_ROOT_PATH ||
      normalized.startsWith(`${PROJECT_ROOT_PATH}/`)
   ) {
      return normalized;
   }
   return `${PROJECT_ROOT_PATH}${normalized}`;
};

export interface IApplyFileChangesOptions {
   userId: string;
   fileSystemId: string;
   /** 文件系统中现有的全部文件 */
   files: VirtualFiles[];
   changes: FileChange[];
   /** prepareAssets(...).bind(tx) 的结果，与 changes 中的 change / create 一一对应 */
   preparedWrites: { content: string | null; assetId: string | null }[];
}

/** 在事务中把一批变更写入文件系统（调用方负责事先锁定项目行并校验权限与版本） */
export const applyFileChanges = async (
   tx: Prisma.TransactionClient,
   options: IApplyFileChangesOptions,
) => {
   const { userId, fileSystemId, changes, preparedWrites } = options;
   let writeIndex = 0;
   const existingFiles = new Map<string, VirtualFiles>(
      options.files.map((f) => [toProjectPath(f.path), f]),
   );

   for (const change of changes) {
      switch (change.type) {
         case 'rm': {
            // 删除文件或文件夹
            const file = existingFiles.get(change.path);
            if (file) {
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
            if (filesToDelete.length > 0) {
               await tx.virtualFiles.deleteMany({
                  where: {
                     vid: { in: filesToDelete },
                  },
               });
               for (const [filePath] of existingFiles) {
                  if (filePath.startsWith(folderPrefix)) {
                     existingFiles.delete(filePath);
                  }
               }
               logger.debug({ path: change.path }, 'Remove folder');
            }
            break;
         }

         case 'mv': {
            // 移动/重命名文件
            const file = existingFiles.get(change.oldPath);

            if (file) {
               // 统一存为 /project/... 形式
               const newPath = toProjectPath(change.newPath);
               await tx.virtualFiles.update({
                  where: { vid: file.vid },
                  data: { path: newPath, content: movedContent(file) },
               });
               existingFiles.delete(change.oldPath);
               existingFiles.set(newPath, {
                  ...file,
                  path: newPath,
                  content: movedContent(file),
               });
               logger.debug(
                  { oldPath: change.oldPath, newPath: change.newPath },
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
                  const relativePath = filePath.slice(oldFolderPrefix.length);
                  const updatedPath = newFolderPrefix + relativePath;
                  const newDbPath = toProjectPath(updatedPath);

                  await tx.virtualFiles.update({
                     where: { vid: fileData.vid },
                     data: { path: newDbPath, content: movedContent(fileData) },
                  });
                  existingFiles.delete(filePath);
                  existingFiles.set(newDbPath, {
                     ...fileData,
                     path: newDbPath,
                     content: movedContent(fileData),
                  });
               }
            }
            logger.debug(
               { oldPath: change.oldPath, newPath: change.newPath },
               'Move folder',
            );
            break;
         }

         case 'change':
         case 'create': {
            const body = preparedWrites[writeIndex++]!;
            const file = existingFiles.get(change.path);
            if (file) {
               // 已存在则更新内容
               const updated = await tx.virtualFiles.update({
                  where: { vid: file.vid },
                  data: { content: body.content, assetId: body.assetId },
               });
               existingFiles.set(change.path, updated);
            } else {
               // 不存在则创建
               const newPath = toProjectPath(change.path);
               const newFile = await tx.virtualFiles.create({
                  data: {
                     path: newPath,
                     content: body.content,
                     assetId: body.assetId,
                     ownerId: userId,
                     fileSystemFsid: fileSystemId,
                  },
               });
               existingFiles.set(newPath, newFile);
            }
            break;
         }
      }
   }
};
