import { logger } from '~~/server/utils/logger';
import { middleware } from '../trpc';

export const log = () => {
   return middleware(async ({ ctx, next }) => {
      const ip = getRequestIP(ctx.event, { xForwardedFor: true });
      const startTime = Date.now();
      const r = await next();

      const duration = Date.now() - startTime;

      if (r.ok) {
         logger.info(
            { ip, duration, path: ctx.event.path },
            'tRPC request',
         );
      } else {
         logger.error(
            { ip, duration, path: ctx.event.path, error: r.error },
            'tRPC request',
         );
      }

      return r;
   });
};
