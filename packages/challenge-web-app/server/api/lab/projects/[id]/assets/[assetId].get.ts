import { createError, getRouterParam, setResponseHeaders } from 'h3';
import { requireEventUser, toHttpError } from '../../../../../utils/event-auth';
import { readLabProjectAssetBytes } from '../../../../../trpc/services/file-assets';

/** 下载实验室项目中的二进制文件：GET /api/lab/projects/:id/assets/:assetId（返回原始字节） */
export default defineEventHandler(async (event) => {
   const user = requireEventUser(event, { csrf: false });
   const projectId = getRouterParam(event, 'id');
   const assetId = getRouterParam(event, 'assetId');
   if (!projectId || !assetId) {
      throw createError({ statusCode: 400, statusMessage: 'Missing project id or asset id' });
   }
   try {
      const bytes = await readLabProjectAssetBytes(user.userId, projectId, assetId);
      setResponseHeaders(event, {
         'Content-Type': 'application/octet-stream',
         'Content-Length': String(bytes.length),
         // 资产按内容寻址、不可变，但属于私有数据
         'Cache-Control': 'private, max-age=31536000, immutable',
         // 实验室页面开启了 COEP: require-corp，同源资源也需声明可被加载
         'Cross-Origin-Resource-Policy': 'same-origin',
      });
      return bytes;
   } catch (error) {
      throw toHttpError(error);
   }
});
