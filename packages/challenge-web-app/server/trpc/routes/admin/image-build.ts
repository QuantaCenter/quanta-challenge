import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import prisma from '~~/lib/prisma';
import { useStore } from '../../store';
import {
   countImageBuildReferences,
   findImageBuildReferences,
} from '../../../services/image-build';
import { TRPCError } from '@trpc/server';
import z from 'zod';

const nameSchema = z.string().trim().min(1, '快照镜像名称不能为空').max(50);
const descriptionSchema = z.string().trim().max(500, '备注最多 500 字');
const buildFileSchema = z
   .string()
   .min(1, '构建文件不能为空')
   .max(20_000, '构建文件过长');

/** 快照镜像元数据管理。产物文件与 ready 状态只由 PUT /api/image-builds/upload 切换 */
export const imageBuildRouter = router({
   list: protectedAdminProcedure.query(async () => {
      const [builds, references] = await Promise.all([
         prisma.imageBuild.findMany({
            orderBy: { updatedAt: 'desc' },
            select: {
               id: true,
               name: true,
               description: true,
               status: true,
               compression: true,
               formatVersion: true,
               sizeBytes: true,
               compressedSizeBytes: true,
               fileName: true,
               createdAt: true,
               updatedAt: true,
            },
         }),
         countImageBuildReferences(),
      ]);
      return builds.map((build) => ({
         ...build,
         referenceCount: references.get(build.id) ?? 0,
      }));
   }),

   /** 详情：含构建文件与引用它的题目 */
   detail: protectedAdminProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
         const [build, references] = await Promise.all([
            prisma.imageBuild.findUnique({
               where: { id: input.id },
               select: {
                  id: true,
                  name: true,
                  description: true,
                  buildFile: true,
                  status: true,
                  compression: true,
                  formatVersion: true,
                  sizeBytes: true,
                  compressedSizeBytes: true,
                  createdAt: true,
                  updatedAt: true,
               },
            }),
            findImageBuildReferences(input.id),
         ]);
         if (!build) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '快照镜像不存在或已被删除' });
         }
         return { ...build, references };
      }),

   create: protectedAdminProcedure
      .input(
         z.object({
            name: nameSchema,
            description: descriptionSchema.default(''),
            buildFile: buildFileSchema,
         })
      )
      .mutation(async ({ ctx, input }) => {
         return prisma.imageBuild.create({
            data: {
               name: input.name,
               description: input.description,
               buildFile: input.buildFile,
               createdBy: ctx.user.userId,
            },
            select: { id: true },
         });
      }),

   update: protectedAdminProcedure
      .input(
         z.object({
            id: z.string().min(1),
            name: nameSchema.optional(),
            description: descriptionSchema.optional(),
            buildFile: buildFileSchema.optional(),
         })
      )
      .mutation(async ({ input }) => {
         const { id, ...data } = input;
         const result = await prisma.imageBuild.updateMany({
            where: { id },
            data,
         });
         if (result.count === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '快照镜像不存在或已被删除' });
         }
         return { ok: true };
      }),

   /** 删除快照镜像。有题目引用时需 `force`，所有引用它的题目版本在同一事务中解绑 */
   remove: protectedAdminProcedure
      .input(z.object({ id: z.string().min(1), force: z.boolean().default(false) }))
      .mutation(async ({ input }) => {
         if (!input.force) {
            const references = await findImageBuildReferences(input.id);
            if (references.length > 0) {
               throw new TRPCError({
                  code: 'CONFLICT',
                  message: `快照镜像仍被 ${references.length} 道题目使用，确认后可强制删除并将这些题目改为不使用快照镜像`,
               });
            }
         }

         const result = await prisma.$transaction(async (tx) => {
            const build = await tx.imageBuild.findUnique({
               where: { id: input.id },
               select: { fileId: true },
            });
            if (!build) return null;
            const detached = await tx.problems.updateMany({
               where: { snapshotImageId: input.id },
               data: { snapshotImageId: null },
            });
            await tx.imageBuild.deleteMany({ where: { id: input.id } });
            return { fileId: build.fileId, detachedCount: detached.count };
         });
         if (!result) return { ok: true, detachedCount: 0 };

         // 事务提交后再删文件，失败最多留下孤儿文件
         if (result.fileId) {
            await useStore()
               .delete(result.fileId)
               .catch(() => undefined);
         }
         return { ok: true, detachedCount: result.detachedCount };
      }),
});
