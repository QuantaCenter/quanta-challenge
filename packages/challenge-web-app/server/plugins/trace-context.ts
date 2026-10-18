import type { H3Event } from 'h3';
import {
   createTraceId,
   isValidTraceId,
   runWithRequestContext,
   type RequestContext,
} from '@challenge/shared/trace';

/* 全请求追踪上下文 */
export default defineNitroPlugin((nitroApp) => {
   const originalHandler = nitroApp.h3App.handler;

   nitroApp.h3App.handler = async (event: H3Event) => {
      const incoming = getHeader(event, 'x-trace-id');
      const traceId = isValidTraceId(incoming) ? incoming : createTraceId();
      setHeader(event, 'x-trace-id', traceId);

      const store: RequestContext = { traceId };
      event.context.__requestContext = store;

      return runWithRequestContext(store, () => originalHandler(event));
   };
});
