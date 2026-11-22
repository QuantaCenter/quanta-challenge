import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';
import { logger } from '~~/server/utils/logger';

export const limitRequest = (
   timesPerMinute: number,
   { scope = 'auth', byUser = false } = {},
) => {
   return middleware(async ({ ctx, next }) => {
      const requester =
         (byUser ? ctx.user?.userId : undefined) ??
         (await getRequestFingerprint(ctx.event, { xForwardedFor: true })) ??
         'unknown';
      const redis = useRedis();

      const key = `req_limit:${scope}:${requester}`;
      const results = await redis.multi().incr(key).expire(key, 60, 'NX').exec();
      const count = results?.[0]?.[1];
      if (typeof count !== 'number' || results?.[1]?.[0]) {
         throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }

      if (count > timesPerMinute) {
         logger.warn({ scope, count }, 'Too many requests, blocking request');
         throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests',
         });
      }

      return next();
   });
};
