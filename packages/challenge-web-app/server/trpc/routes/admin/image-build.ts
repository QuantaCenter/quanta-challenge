import { parseCustomImageId } from '@challenge/shared/backend-service-image';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import prisma from '~~/lib/prisma';
import { useStore } from '../../store';
import { TRPCError } from '@trpc/server';
import z from 'zod';

/**
 * WebContainer 基础镜像的管理接口。
 *
 * 镜像二进制（snapshot）走独立的 PUT 路由 /api/image-builds/upload（大文件，
 * 不适合塞进 tRPC 的 JSON body），这里的接口只管元数据 CRUD。
 */
export const imageBuildRouter = router({
   list: protectedAdminProcedure.query(() =>
      prisma.imageBuild.findMany({
         orderBy: { createdAt: 'desc' },
         select: {
            id: true,
            name: true,
            status: true,
            compression: true,
            sizeBytes: true,
            compressedSizeBytes: true,
            fileName: true,
            createdAt: true,
         },
      })
   ),

   create: protectedAdminProcedure
      .input(
         z.object({
            name: z.string().trim().min(1, '镜像名称不能为空').max(50),
            buildFile: z.string().min(1, '构建文件不能为空'),
         })
      )
      .mutation(async ({ ctx, input }) => {
         return prisma.imageBuild.create({
            data: {
               name: input.name,
               buildFile: input.buildFile,
               createdBy: ctx.user.userId,
            },
         });
      }),

   update: protectedAdminProcedure
      .input(
         z.object({
            id: z.string(),
            name: z.string().trim().min(1).max(50).optional(),
            buildFile: z.string().min(1).optional(),
         })
      )
      .mutation(async ({ input }) => {
         const { id, ...data } = input;
         // 重新编辑构建文件后，旧产物即失效，回到 building 状态等待重新上传
         const reset =
            data.buildFile !== undefined
               ? { status: 'building', fileId: null, fileName: null }
               : {};
         return prisma.imageBuild.update({
            where: { id },
            data: { ...data, ...reset },
         });
      }),

   remove: protectedAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
         const build = await prisma.imageBuild.findUnique({
            where: { id: input.id },
            select: { fileName: true },
         });
         if (build?.fileName) {
            const store = useStore();
            await store.delete(build.fileName).catch(() => undefined);
         }
         await prisma.imageBuild.delete({ where: { id: input.id } });
         return { ok: true };
      }),

   /** 供做题页解析 `custom:<id>` 引用：拿文件名与压缩格式 */
   get: protectedAdminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
         const build = await prisma.imageBuild.findUnique({
            where: { id: parseCustomImageId(input.id) },
            select: {
               id: true,
               name: true,
               status: true,
               compression: true,
               fileName: true,
               sizeBytes: true,
               compressedSizeBytes: true,
            },
         });
         if (!build) {
            throw new TRPCError({
               code: 'NOT_FOUND',
               message: '镜像不存在或已被删除',
            });
         }
         return build;
      }),
});
