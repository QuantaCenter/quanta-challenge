import type { H3Error } from 'h3';
import { getRequestContext } from '@challenge/shared/trace';
import { logger } from '~~/server/utils/logger';

/* Nitro 层未捕获错误统一兜底 */
export default defineNitroPlugin((nitroApp) => {
   nitroApp.hooks.hook('error', (error, { event }) => {
      const h3Error = error as H3Error<{ traceId?: string }>;
      const traceId = getRequestContext()?.traceId;
      if (traceId && h3Error.data?.traceId !== traceId) {
         h3Error.data = { ...(h3Error.data ?? {}), traceId };
      }
      logger.error(
         { err: error, path: event?.path, method: event?.method },
         'SSR 未捕获错误',
      );
   });
});
