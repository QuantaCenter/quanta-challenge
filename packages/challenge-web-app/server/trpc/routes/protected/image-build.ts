import { parseCustomImageId } from '@challenge/shared/backend-service-image';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import prisma from '~~/lib/prisma';
import { TRPCError } from '@trpc/server';
import z from 'zod';

/** 做题页读取题目绑定的自定义镜像（WebContainer 基础镜像）元数据 */
export const imageBuildProtectedRouter = router({
   get: protectedProcedure
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
               message: '题目绑定的基础镜像不存在或已被删除',
            });
         }
         return build;
      }),
});
