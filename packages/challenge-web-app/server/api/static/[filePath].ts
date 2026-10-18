// server/api/static/[filePath].ts
import { createReadStream } from 'fs';
import { join, resolve, sep, extname } from 'path';
import { readFile, stat } from 'fs/promises';
import { sendStream, createError, getRouterParam, setHeader } from 'h3';
import { lookup } from 'mime-types';
import { resolveLocalStorePath } from '@challenge/shared/store';

/** 只允许读取图片类产物（头像、标签图标、封面、徽章、截图），阻止 local_store 其它文件外泄；扩展名与 acceptedBinaryExtensions 对齐。 */
const ALLOWED_EXTENSIONS = new Set([
   '.png',
   '.jpg',
   '.jpeg',
   '.gif',
   '.webp',
   '.bmp',
   '.tiff',
   '.ico',
   '.cur',
   '.svg',
]);

export default defineEventHandler(async (event) => {
   const filePath = getRouterParam(event, 'filePath');
   if (!filePath) {
      throw createError({
         statusCode: 400,
         statusMessage: 'Missing file path',
      });
   }

   // 用统一解析器，保证与判题调度器写入封面时用的是同一个绝对目录。 原来这里是 resolve('./local_store')，按 cwd 解析到 packages/challenge-web-app/local_store， 而调度器写进的是 packages/challenge-judge-scheduler/local_store，于是所有封面 404。
   const base = resolveLocalStorePath();

   // 关键：先解码再规范化，然后校验最终路径仍在 base 之内。
   // 原实现直接 join(base, filePath)，'../' 可以逃逸出 local_store 读取任意文件。
   let decoded: string;
   try {
      decoded = decodeURIComponent(filePath);
   } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file path' });
   }

   if (decoded.includes('\0')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file path' });
   }

   const fullPath = resolve(base, decoded);
   const baseWithSep = base.endsWith(sep) ? base : base + sep;

   if (fullPath !== base && !fullPath.startsWith(baseWithSep)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }

   if (!ALLOWED_EXTENSIONS.has(extname(fullPath).toLowerCase())) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
   }

   try {
      const info = await stat(fullPath);
      if (!info.isFile()) {
         throw new Error('not a file');
      }
      await readFile(fullPath);

      /** 必须显式下发 Content-Type：nosniff 下浏览器从不嗅探 SVG，否则 SVG 徽章一律裂图。 */
       */
      const contentType = lookup(fullPath);
      if (contentType) {
         setHeader(event, 'content-type', contentType);
      }

      return sendStream(event, createReadStream(fullPath));
   } catch {
      throw createError({ statusCode: 404, statusMessage: 'File not found' });
   }
});
