import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { useStore } from '../../store';
import prisma from '~~/lib/prisma';
import path from 'path';
import { imageFormDataOrBase64Schema } from '../../schemas/image-upload';

const uploadImageProcedure = protectedAdminProcedure
   .input(imageFormDataOrBase64Schema)
   .mutation(async ({ ctx, input }) => {
      const { buffer: fileBuffer, fileName } = input;
      const store = useStore();
      const fileId = await store.save(fileBuffer, fileName);
      return await prisma.image.create({
         data: {
            id: fileId,
            name: `${fileId}${path.extname(fileName)}`,
            UserImage: {
               create: {
                  userId: ctx.user.userId,
               },
            },
         },
      });
   });

export const imageRouter = router({
   upload: uploadImageProcedure,
});
