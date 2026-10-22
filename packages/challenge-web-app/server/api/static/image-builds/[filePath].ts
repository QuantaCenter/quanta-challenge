import { createReadStream } from 'fs';
import { join, resolve, sep } from 'path';
import { stat } from 'fs/promises';
import { sendStream, createError, getRouterParam, setHeader } from 'h3';
import { resolveLocalStorePath } from '@challenge/shared/store';
import prisma from '~~/lib/prisma';

/**
 * 基础镜像下载：GET /api/static/image-builds/<fileName>
 *
 * 与通用静态路由 server/api/static/[filePath].ts 的区别：
 * 1. 只允许下载 image_builds 表里登记过且 status=ready 的文件（按 fileName 精确匹配，
 *    而不是扩展名白名单 + 路径校验），镜像构建产物不满足那条路由的图片白名单；
 * 2. 存储的是服务端压缩后的产物（br / gzip），按表里的 compression 字段下发
 *    Content-Encoding，浏览器网络栈透明解压后客户端拿到的就是原始 snapshot。
 */
export default defineEventHandler(async (event) => {
   const filePath = getRouterParam(event, 'filePath');
   if (!filePath) {
      throw createError({ statusCode: 400, statusMessage: 'Missing file path' });
   }

   let decoded: string;
   try {
      decoded = decodeURIComponent(filePath);
   } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file path' });
   }
   // 只接受形如 <fileId>.bin 或 <fileId>.bin.gz 的纯文件名
   if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file path' });
   }
   if (!/^[\w-]+(\.bin|\.gz|\.br)$/.test(decoded)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }

   const build = await prisma.imageBuild.findFirst({
      where: { fileName: decoded, status: 'ready' },
      select: { fileId: true, compression: true },
   });
   if (!build?.fileId) {
      throw createError({ statusCode: 404, statusMessage: 'Image not found' });
   }

   const base = resolveLocalStorePath();
   const fullPath = resolve(base, decoded);
   const baseWithSep = base.endsWith(sep) ? base : base + sep;
   if (!fullPath.startsWith(baseWithSep)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }

   try {
      const info = await stat(fullPath);
      if (!info.isFile()) throw new Error('not a file');
      setHeader(event, 'content-type', 'application/octet-stream');
      setHeader(event, 'cache-control', 'public, max-age=31536000, immutable');
      // 存储的是压缩产物：带上 Content-Encoding，由浏览器网络栈透明解压，
      // 客户端 fetch 拿到的直接就是原始 snapshot（无需 JS 侧 DecompressionStream）
      if (build.compression === 'br' || build.compression === 'gzip') {
         setHeader(event, 'content-encoding', build.compression);
      }
      return sendStream(event, createReadStream(fullPath));
   } catch {
      throw createError({ statusCode: 404, statusMessage: 'File not found' });
   }
});
