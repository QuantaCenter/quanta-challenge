import type { NuxtError } from '#app';

/* Vue SSR 渲染错误兜底 */
export default defineNuxtPlugin((nuxtApp) => {
   const event = useRequestEvent();
   const traceId = (
      event?.context as { __requestContext?: { traceId?: string } } | undefined
   )?.__requestContext?.traceId;

   nuxtApp.hook('vue:error', (err) => {
      const error = err as NuxtError | undefined;
      if (error && typeof error === 'object' && 'statusCode' in error) {
         error.data = { ...(error.data as object), traceId };
      }
      console.error(
         `[SSR 渲染错误] path=${event?.path ?? '-'} traceId=${traceId ?? '-'}`,
         err,
      );
   });
});
