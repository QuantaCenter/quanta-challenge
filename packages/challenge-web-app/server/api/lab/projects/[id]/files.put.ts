import { createError, getHeader, getQuery, getRouterParam, readRawBody } from 'h3';
import {
   encodeSnapshotBytes,
   hasBinarySnapshotExtension,
} from '@challenge/shared/snapshot-content';
import { requireEventUser, toHttpError } from '../../../../utils/event-auth';
import {
   getLabLimits,
   labProjectService,
   normalizeLabFilePath,
} from '../../../../trpc/services/lab-project';

/**
 * 实验室文件上传：PUT /api/lab/projects/:id/files?path=/project/xxx&revision=n
 *
 * 请求体为文件原始字节（application/octet-stream）。单文件与项目总空间的上限见
 * runtimeConfig.public.lab；超出项目空间时整体回滚并返回 413。
 * 不走 tRPC：base64 + JSON 会让请求体膨胀三分之一，且无法单独放宽请求体大小限制。
 */
export default defineEventHandler(async (event) => {
   const user = requireEventUser(event, { csrf: true });
   const { maxFileBytes } = getLabLimits();

   const projectId = getRouterParam(event, 'id');
   const query = getQuery(event);
   if (!projectId || typeof query.path !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Missing project id or path' });
   }
   const revision =
      typeof query.revision === 'string' && query.revision !== ''
         ? Number(query.revision)
         : undefined;
   if (revision !== undefined && !Number.isInteger(revision)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid revision' });
   }

   const tooLarge = () =>
      createError({
         statusCode: 413,
         statusMessage: 'PAYLOAD_TOO_LARGE',
         data: { message: `单个文件不能超过 ${maxFileBytes / 1024 / 1024}MB` },
      });
   if (Number(getHeader(event, 'content-length')) > maxFileBytes) {
      throw tooLarge();
   }

   try {
      const path = normalizeLabFilePath(query.path);
      const body = (await readRawBody(event, false)) ?? Buffer.alloc(0);
      if (body.length > maxFileBytes) throw tooLarge();

      // 与编辑器快照编码一致：UTF-8 文本按原文保存，其余转为 base64 data URL（服务端会落为文件资产）
      const content = encodeSnapshotBytes(
         new Uint8Array(body),
         hasBinarySnapshotExtension(path),
      );
      const result = await labProjectService.sync({
         userId: user.userId,
         projectId,
         revision,
         changes: [{ type: 'create', path, content }],
      });
      return { path, sizeBytes: body.length, projectSizeBytes: result.sizeBytes };
   } catch (error) {
      throw toHttpError(error);
   }
});
