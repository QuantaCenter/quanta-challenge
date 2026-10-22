import {
   createError,
   getHeader,
   getQuery,
   readRawBody,
   setResponseStatus,
} from 'h3';
import { useStore } from '../../trpc/store';
import {
   IMAGE_BUILD_MAX_COMPRESSED_BYTES,
   IMAGE_BUILD_MAX_RAW_BYTES,
   measureGunzipSize,
   requireImageBuildUser,
} from '../../services/image-build';
import prisma from '~~/lib/prisma';

/**
 * 快照镜像上传：PUT /api/image-builds/upload?id=<ImageBuild.id>
 *
 * 请求体为 gzip 压缩的 snapshot（application/octet-stream），校验后原样存储。
 * 依次写入新文件、条件更新记录、删除旧文件，任一步失败都不会使记录指向缺失的文件。
 */
export default defineEventHandler(async (event) => {
   requireImageBuildUser(event, { csrf: true, admin: true });

   const { id } = getQuery(event);
   if (typeof id !== 'string' || !id) {
      throw createError({ statusCode: 400, statusMessage: 'Missing id' });
   }

   const declaredLength = Number(getHeader(event, 'content-length'));
   if (declaredLength > IMAGE_BUILD_MAX_COMPRESSED_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Image too large' });
   }

   const build = await prisma.imageBuild.findUnique({
      where: { id },
      select: { fileId: true },
   });
   if (!build) {
      throw createError({ statusCode: 404, statusMessage: 'ImageBuild not found' });
   }

   const body = await readRawBody(event, false);
   if (!body || body.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Empty body' });
   }
   if (body.length > IMAGE_BUILD_MAX_COMPRESSED_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Image too large' });
   }
   if (body[0] !== 0x1f || body[1] !== 0x8b) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid gzip payload' });
   }

   let sizeBytes: number;
   try {
      sizeBytes = await measureGunzipSize(body, IMAGE_BUILD_MAX_RAW_BYTES);
   } catch (error) {
      if (error instanceof RangeError) {
         throw createError({
            statusCode: 413,
            statusMessage: 'Decompressed image too large',
         });
      }
      throw createError({ statusCode: 400, statusMessage: 'Invalid gzip payload' });
   }
   if (sizeBytes === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Empty image' });
   }

   const store = useStore();
   // 落盘文件名为 <fileId>.gz
   const fileId = await store.save(body, `image-build-${id}.gz`);
   const fileName = `${fileId}.gz`;

   // 以读取时的 fileId 作乐观锁
   let updated: { count: number };
   try {
      updated = await prisma.imageBuild.updateMany({
         where: { id, fileId: build.fileId },
         data: {
            status: 'ready',
            compression: 'gzip',
            fileId,
            fileName,
            sizeBytes,
            compressedSizeBytes: body.length,
         },
      });
   } catch (error) {
      await store.delete(fileId).catch(() => undefined);
      throw error;
   }
   if (updated.count === 0) {
      await store.delete(fileId).catch(() => undefined);
      throw createError({
         statusCode: 409,
         statusMessage: 'ImageBuild was modified or removed concurrently',
      });
   }

   if (build.fileId) {
      await store.delete(build.fileId).catch(() => undefined);
   }

   setResponseStatus(event, 200);
   return { ok: true, fileId, fileName, sizeBytes, compressedSizeBytes: body.length };
});
