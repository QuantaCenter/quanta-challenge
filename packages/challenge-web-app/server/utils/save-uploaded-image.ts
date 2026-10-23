import path from 'node:path';
import prisma from '~~/lib/prisma';
import { compressUploadedImage } from '@challenge/shared/image/compress-upload';
import { logger } from '~~/server/utils/logger';
import { useStore } from '../trpc/store';

export async function saveUploadedImage(input: {
   fileBuffer: Buffer;
   fileName: string;
   userId: string;
}) {
   const { fileBuffer, fileName, userId } = input;

   let buffer = fileBuffer;
   try {
      buffer = await compressUploadedImage(fileBuffer, fileName);
   } catch (error) {
      logger.warn({ err: error, fileName }, '图片压缩失败，保存原图');
   }

   const fileId = await useStore().save(buffer, fileName);

   return prisma.image.create({
      data: {
         id: fileId,
         name: `${fileId}${path.extname(fileName)}`,
         UserImage: {
            create: { userId },
         },
      },
      select: {
         id: true,
         name: true,
      },
   });
}
