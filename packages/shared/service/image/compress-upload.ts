import path from 'node:path';
import sharp from 'sharp';

const MAX_DIMENSION = 2048;

const encoders: Record<string, (pipeline: sharp.Sharp) => sharp.Sharp> = {
   '.jpg': (p) => p.jpeg({ quality: 82, mozjpeg: true }),
   '.jpeg': (p) => p.jpeg({ quality: 82, mozjpeg: true }),
   '.png': (p) => p.png({ compressionLevel: 9, adaptiveFiltering: true }),
   '.webp': (p) => p.webp({ quality: 82 }),
};

/** 按扩展名压缩图片；无法压缩时返回原 buffer */
export async function compressUploadedImage(
   buffer: Buffer,
   fileName: string,
): Promise<Buffer> {
   const encode = encoders[path.extname(fileName).toLowerCase()];
   if (!encode) return buffer;

   const meta = await sharp(buffer).metadata();
   if ((meta.pages ?? 1) > 1) return buffer;

   const output = await encode(
      sharp(buffer)
         .rotate()
         .resize(MAX_DIMENSION, MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
         }),
   ).toBuffer();

   return output.length < buffer.length ? output : buffer;
}
