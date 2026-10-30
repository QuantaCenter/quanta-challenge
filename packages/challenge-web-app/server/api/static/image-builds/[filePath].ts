import { createReadStream } from 'fs';
import { resolve, sep } from 'path';
import { stat } from 'fs/promises';
import { sendStream, createError, getRouterParam, setHeader } from 'h3';
import { resolveLocalStorePath } from '@challenge/shared/store';
import { requireImageBuildUser } from '../../../services/image-build';
import prisma from '~~/lib/prisma';

/**
 * 快照镜像下载：GET /api/static/image-builds/<fileName>
 *
 * 需要登录，只下发 status=ready 的记录对应的文件，并按 compression 设置 Content-Encoding。
 */
export default defineEventHandler(async (event) => {
   requireImageBuildUser(event, { csrf: false, admin: false });

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
   if (!/^[\w-]+\.(gz|br)$/.test(decoded)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }

   const build = await prisma.imageBuild.findFirst({
      where: { fileName: decoded, status: 'ready', formatVersion: 1 },
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

   let size: number;
   try {
      const info = await stat(fullPath);
      if (!info.isFile()) throw new Error('not a file');
      size = info.size;
   } catch {
      throw createError({ statusCode: 404, statusMessage: 'File not found' });
   }

   setHeader(event, 'content-type', 'application/octet-stream');
   setHeader(event, 'content-length', size);
   // 文件名随上传变化、内容不可变；需要登录，仅允许私有缓存
   setHeader(event, 'cache-control', 'private, max-age=31536000, immutable');
   if (build.compression === 'br' || build.compression === 'gzip') {
      setHeader(event, 'content-encoding', build.compression);
   }
   return sendStream(event, createReadStream(fullPath));
});
