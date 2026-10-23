import z from 'zod';

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const SIZE_MESSAGE = '文件大小不能超过 5MB';

/** FormData 上传，字段 `file` */
export const imageFormDataSchema = z
   .instanceof(FormData)
   .transform((formData) => ({ file: formData.get('file') }))
   .pipe(
      z.object({
         file: z
            .file({ error: '缺少图片文件' })
            .max(IMAGE_UPLOAD_MAX_BYTES, { error: SIZE_MESSAGE }),
      }),
   )
   .transform(async ({ file }) => ({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
   }));

/** 兼容 base64 JSON 上传 */
export const imageBase64Schema = z
   .object({
      fileBase64: z
         .base64()
         .refine(
            (fileb64) =>
               Buffer.byteLength(fileb64, 'base64') <= IMAGE_UPLOAD_MAX_BYTES,
            { error: SIZE_MESSAGE },
         ),
      fileName: z.string(),
   })
   .transform(({ fileBase64, fileName }) => ({
      buffer: Buffer.from(fileBase64, 'base64'),
      fileName,
   }));

/** FormData 或 base64；union 失败时透传子分支错误信息 */
export const imageFormDataOrBase64Schema = z.union(
   [imageFormDataSchema, imageBase64Schema],
   {
      error: (issue) =>
         issue.code === 'invalid_union'
            ? issue.errors.flat().find((sub) => sub.path.length > 0)?.message
            : undefined,
   },
);
