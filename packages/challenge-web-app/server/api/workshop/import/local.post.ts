import { ReadableStream } from 'node:stream/web';
import { createError, defineEventHandler, getHeader, isError, type H3Event } from 'h3';
import z from 'zod';
import { getLocalImportRequestLimit, WORKSHOP_LOCAL_IMPORT_MAX_FILES } from '~~/shared/workshop-local-import';
import { getWorkshopLimits, workshopProjectService } from '../../../trpc/services/workshop-project';
import { requireEventUser, toHttpError } from '../../../utils/event-auth';

const ManifestSchema = z.object({
   importId: z.string().regex(/^[0-9a-f]{32}$/),
   name: z.string().trim().min(1).max(40).refine((name) => !name.includes('\0')),
   paths: z.array(z.string()).min(1).max(WORKSHOP_LOCAL_IMPORT_MAX_FILES),
});

const tooLarge = () => createError({
   statusCode: 413,
   data: { message: '上传的文件夹超过工坊项目容量限制' },
});

const readLimitedBody = async function* (event: H3Event, byteLimit: number) {
   let size = 0;
   for await (const chunk of event.node.req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > byteLimit) throw tooLarge();
      yield chunk;
   }
};

export default defineEventHandler(async (event) => {
   const user = requireEventUser(event, { csrf: true });
   const badForm = () => createError({
      statusCode: 400,
      data: { message: '导入文件或项目名称无效，请检查后重试' },
   });
   const contentType = getHeader(event, 'content-type');
   if (!contentType || !/^multipart\/form-data\s*(?:;|$)/i.test(contentType)) throw badForm();

   const byteLimit = getLocalImportRequestLimit(getWorkshopLimits().maxProjectBytes);
   if (Number(getHeader(event, 'content-length')) > byteLimit) throw tooLarge();
   let form: FormData;
   try {
      // Node 和 DOM 的 ReadableStream 类型声明不同，运行时是同一个 Web Streams API。
      const body = ReadableStream.from(readLimitedBody(event, byteLimit)) as unknown as globalThis.ReadableStream<Uint8Array>;
      form = await new Response(body, {
         headers: { 'content-type': contentType },
      }).formData();
   } catch (error) {
      if (isError(error) && error.statusCode === 413) throw error;
      throw badForm();
   }

   const fields = form.getAll('manifest');
   const manifest = fields[0];
   if (fields.length !== 1 || typeof manifest !== 'string') throw badForm();
   let metadata: unknown;
   try {
      metadata = JSON.parse(manifest);
   } catch {
      throw badForm();
   }
   const parsed = ManifestSchema.safeParse(metadata);
   if (!parsed.success) throw badForm();
   const { importId, name, paths } = parsed.data;
   const entries = form.getAll('file');
   const blobs = entries.filter((entry) => typeof entry !== 'string');
   if (entries.length !== paths.length || blobs.length !== entries.length) throw badForm();

   try {
      return await workshopProjectService.importLocal({
         userId: user.userId,
         importId,
         name,
         files: paths.map((path, index) => ({ path, blob: blobs[index]! })),
      });
   } catch (error) {
      throw toHttpError(error);
   }
});
