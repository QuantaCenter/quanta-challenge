// server/api/static/[filePath].ts
import { createReadStream } from 'fs';
import { join, resolve, sep, extname } from 'path';
import { readFile, stat } from 'fs/promises';
import { sendStream, createError, getRouterParam, setHeader } from 'h3';
import { lookup } from 'mime-types';
import { resolveLocalStorePath } from '@challenge/shared/store';

/**
 * 只允许读取图片类产物。这些正是本路由当前唯一的用途（头像、题目标签图标、
 * 封面、成就徽章、判题截图），因此白名单不会影响正常功能，同时阻止把
 * local_store 下的其它文件（配置、数据库文件等）通过此路由暴露出去。
 * 扩展名与 acceptedBinaryExtensions / user.ts 的允许列表保持一致。
 */
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

   // 用统一解析器，保证与判题调度器写入封面时用的是同一个绝对目录。
   // 原来这里是 resolve('./local_store')，按 cwd 解析到 packages/challenge-web-app/local_store，
   // 而调度器写进的是 packages/challenge-judge-scheduler/local_store，于是所有封面 404。
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

      /**
       * 必须显式下发 Content-Type。
       *
       * nuxt-security 会给所有响应加上 `X-Content-Type-Options: nosniff`，而浏览器
       * **从不嗅探 SVG**（规范要求 SVG 只能是 `image/svg+xml`）—— 于是 PNG/JPEG 因为有
       * 魔数还能侥幸显示，而成就徽章这类 SVG 在 `<img>` 里一律渲染成"裂图"。
       * 用扩展名查表即可（mime-types 已是本包依赖）。
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
