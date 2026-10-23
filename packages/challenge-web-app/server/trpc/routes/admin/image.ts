import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { imageFormDataOrBase64Schema } from '../../schemas/image-upload';
import { saveUploadedImage } from '~~/server/utils/save-uploaded-image';

const uploadImageProcedure = protectedAdminProcedure
   .input(imageFormDataOrBase64Schema)
   .mutation(async ({ ctx, input }) => {
      const { buffer: fileBuffer, fileName } = input;
      return saveUploadedImage({
         fileBuffer,
         fileName,
         userId: ctx.user.userId,
      });
   });

export const imageRouter = router({
   upload: uploadImageProcedure,
});
