import z from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import prisma from '~~/lib/prisma';
import { router } from '../../trpc';
import { TRPCError } from '@trpc/server';
import { observer } from '../../services/achievement';
import { logger } from '~~/server/utils/logger';
import { prepareAssets } from '../../services/file-assets';
import { applyFileChanges, FileChangeSchema } from '../../services/file-changes';

const SyncFileChangesSchema = z.object({
   problemId: z.number(),
   changes: z.array(FileChangeSchema),
   // 客户端加载项目时的版本号；重置会递增该值，不匹配的旧请求将被拒绝。可选以兼容未升级的调用方
   revision: z.number().int().optional(),
});

/** 同步文件变更到服务器（创建、修改、移动、删除）。 */
const syncFileChangesProcedure = protectedProcedure
   .input(SyncFileChangesSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId, changes, revision } = input;

      if (changes.length === 0) {
         return { success: true, processedCount: 0 };
      }

      const { maxChangesPerSync } = useRuntimeConfig().fileSync;
      if (changes.length > maxChangesPerSync) {
         logger.error(
            {
               count: changes.length,
               changes,
            },
            `Too many changes in one sync`,
         );
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Too many changes in one sync. Maximum allowed is ${maxChangesPerSync}.`,
         });
      }

      const writes = changes.filter((change) => change.type === 'change' || change.type === 'create');
      const assets = await prepareAssets(writes, userId, { deferExistingVerification: true });
      let committed = false;
      try {
         await prisma.$transaction(async (tx) => {
            // 锁定项目行：与重置事务（同样先锁项目行）互斥，保证 revision 校验和后续写入不会被并发重置穿插
            const [lockedProject] = await tx.$queryRaw<
               { pid: string; revision: number }[]
            >`
               SELECT pid, revision FROM projects
               WHERE "ownerId" = ${userId} AND "problemId" = ${problemId} AND "isTemplate" = false
               FOR UPDATE
            `;

            if (!lockedProject) {
               throw new TRPCError({
                  code: 'NOT_FOUND',
                  message: 'Project or file system not found',
               });
            }

            // 重置会递增 revision；携带旧版本号的请求是重置前发出的，写入会恢复被清空的修改，直接拒绝
            if (revision !== undefined && lockedProject.revision !== revision) {
               throw new TRPCError({
                  code: 'CONFLICT',
                  message: 'Project has been reset, please reload the page',
               });
            }

            const project = await tx.projects.findFirst({
               where: {
                  ownerId: userId,
                  problemId: problemId,
                  isTemplate: false,
               },
               include: {
                  FileSystem: {
                     include: {
                        files: { include: { asset: true } },
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

            const fileSystem = project.FileSystem[0];
            const reusableAssets = fileSystem.files.flatMap((file) =>
               file.asset ? [file.asset] : [],
            );
            const preparedWrites = await assets.bind(tx, { reusableAssets });
            await applyFileChanges(tx, {
               userId,
               fileSystemId: fileSystem.fsid,
               files: fileSystem.files,
               changes,
               preparedWrites,
            });
         });
         committed = true;

         // 标记缓存失效
         observer.manualMarkDirty(['virtual_files']);

         return {
            success: true,
            processedCount: changes.length,
         };
      } catch (error) {
         // NOT_FOUND / CONFLICT 等业务错误码原样抛出，不能被包装成 500
         if (error instanceof TRPCError) {
            throw error;
         }
         logger.error(
            { error },
            'Failed to sync file changes',
         );
         throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
               error instanceof Error
                  ? error.message
                  : 'Failed to sync file changes',
         });
      } finally {
         await assets.cleanup(committed);
      }
   });

export const fileSyncRouter = router({
   syncFileChanges: syncFileChangesProcedure,
});
