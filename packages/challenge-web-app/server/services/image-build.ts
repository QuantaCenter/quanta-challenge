import { createGunzip } from 'zlib';
import type { H3Event } from 'h3';
import { createError, getCookie, getHeader } from 'h3';
import { TRPCError } from '@trpc/server';
import { verifyToken, type ITokenPayload } from '../utils/jwt';
import prisma from '~~/lib/prisma';

/** 非 tRPC 路由的鉴权，规则同 trpc/context.ts */
export const requireImageBuildUser = (
   event: H3Event,
   options: { csrf: boolean; admin: boolean },
): ITokenPayload => {
   const token = getCookie(event, 'quanta_access_token');
   if (!token) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
   }
   if (options.csrf) {
      const csrfToken = getCookie(event, 'quanta_csrf_token');
      const xCsrfToken = getHeader(event, 'x-csrf-token');
      if (!csrfToken || !xCsrfToken || csrfToken !== xCsrfToken) {
         throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
      }
   }

   let user: ITokenPayload;
   try {
      user = verifyToken(token);
   } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
   }
   if (options.admin && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }
   return user;
};

/** 流式解压计算大小，超过上限立即中断 */
export const measureGunzipSize = (body: Buffer, limit: number) =>
   new Promise<number>((resolve, reject) => {
      const gunzip = createGunzip();
      let size = 0;
      gunzip.on('data', (chunk: Buffer) => {
         size += chunk.length;
         if (size > limit) {
            gunzip.destroy(new RangeError('decompressed size exceeds limit'));
         }
      });
      gunzip.on('end', () => resolve(size));
      gunzip.on('error', reject);
      gunzip.end(body);
   });

/** 引用该快照镜像的题目（仅当前版本） */
export const findImageBuildReferences = async (imageBuildId: string) =>
   prisma.problems.findMany({
      where: {
         snapshotImageId: imageBuildId,
         CurrentOfBase: { isNot: null },
      },
      orderBy: { pid: 'asc' },
      select: {
         pid: true,
         baseId: true,
         title: true,
         status: true,
         problemType: true,
      },
   });

/** 各快照镜像被题目当前版本引用的次数 */
export const countImageBuildReferences = async () => {
   const rows = await prisma.problems.groupBy({
      by: ['snapshotImageId'],
      where: {
         snapshotImageId: { not: null },
         CurrentOfBase: { isNot: null },
      },
      _count: { _all: true },
   });
   const counts = new Map<string, number>();
   for (const row of rows) {
      if (row.snapshotImageId) {
         counts.set(row.snapshotImageId, row._count._all);
      }
   }
   return counts;
};

/** 校验快照镜像存在且已就绪 */
export const ensureSnapshotImageReady = async (
   snapshotImageId?: string | null,
) => {
   if (!snapshotImageId) return;
   const build = await prisma.imageBuild.findUnique({
      where: { id: snapshotImageId },
      select: { name: true, status: true, fileName: true },
   });
   if (!build) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `快照镜像 ${snapshotImageId} 不存在或已被删除`,
      });
   }
   if (build.status !== 'ready' || !build.fileName) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `快照镜像「${build.name}」尚未上传完成，无法绑定`,
      });
   }
};
