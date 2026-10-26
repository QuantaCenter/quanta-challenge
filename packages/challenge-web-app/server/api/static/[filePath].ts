// server/api/static/[filePath].ts
import { createReadStream } from 'fs';
import { join, resolve, sep, extname } from 'path';
import { readFile, stat } from 'fs/promises';
import { sendStream, createError, getRouterParam, setHeader } from 'h3';
import { lookup } from 'mime-types';
import { resolveLocalStorePath } from '@challenge/shared/store';

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

   const base = resolveLocalStorePath();

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

      const contentType = lookup(fullPath);
      if (contentType) {
         setHeader(event, 'content-type', contentType);
      }

      setHeader(event, 'cache-control', 'public, max-age=31536000, immutable');

      return sendStream(event, createReadStream(fullPath));
   } catch {
      throw createError({ statusCode: 404, statusMessage: 'File not found' });
   }
});
