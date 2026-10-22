import { gunzipSync } from 'zlib';
import {
   createError,
   getCookie,
   getHeader,
   getQuery,
   readRawBody,
   setResponseStatus,
} from 'h3';
import { verifyToken } from '../../utils/jwt';
import { useStore } from '../../trpc/store';
import prisma from '~~/lib/prisma';

/**
 * 基础镜像二进制上传：PUT /api/image-builds/upload?id=<ImageBuild.id>
 *
 * 走独立路由而不是 tRPC，是因为镜像有几十 MB，base64 塞进 tRPC 的 JSON body 不划算；
 * 请求体为客户端用 CompressionStream('gzip') 压缩好的产物
 * （Content-Type: application/octet-stream），本接口解压校验后原样存储。
 * 鉴权与 createContext 相同：quanta_access_token + CSRF 双 Cookie + ADMIN 角色。
 */
export default defineEventHandler(async (event) => {
   const token = getCookie(event, 'quanta_access_token');
   const csrfToken = getCookie(event, 'quanta_csrf_token');
   const xCsrfToken = getHeader(event, 'x-csrf-token');

   if (!token || !csrfToken || !xCsrfToken || csrfToken !== xCsrfToken) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
   }

   let user: ReturnType<typeof verifyToken>;
   try {
      user = verifyToken(token);
   } catch {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
   }
   if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }

   const { id } = getQuery(event);
   if (typeof id !== 'string' || !id) {
      throw createError({ statusCode: 400, statusMessage: 'Missing id' });
   }

   const build = await prisma.imageBuild.findUnique({ where: { id } });
   if (!build) {
      throw createError({ statusCode: 404, statusMessage: 'ImageBuild not found' });
   }

   const rawBody = await readRawBody(event, 'binary');
   const body =
      typeof rawBody === 'string'
         ? Buffer.from(rawBody, 'binary')
         : (rawBody as Buffer | undefined);
   if (!body || body.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Empty body' });
   }
   if (body.length > 160 * 1024 * 1024) {
      throw createError({ statusCode: 413, statusMessage: 'Image too large' });
   }

   // 客户端上传的是 gzip 产物：解压校验真实性，并拿到解压前的原始大小
   let sizeBytes: number;
   try {
      sizeBytes = gunzipSync(body).length;
   } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid gzip payload' });
   }

   const store = useStore();
   // 注意 local-store.save 按 extname 取扩展名：'x.bin.gz' 会存成 <uuid>.gz，
   // 因此 fileName 就是 <fileId>.gz
   const fileId = await store.save(body, `image-build-${id}.gz`);
   const fileName = `${fileId}.gz`;

   await prisma.imageBuild.update({
      where: { id },
      data: {
         status: 'ready',
         compression: 'gzip',
         fileId,
         fileName,
         sizeBytes,
         compressedSizeBytes: body.length,
      },
   });

   setResponseStatus(event, 200);
   return { ok: true, fileId, fileName, sizeBytes, compressedSizeBytes: body.length };
});
