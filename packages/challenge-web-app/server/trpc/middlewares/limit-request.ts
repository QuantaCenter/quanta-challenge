import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';
import { logger } from '~~/server/utils/logger';

export const limitRequest = (timesPerMinute: number) => {
   return middleware(async ({ ctx, next }) => {
      const fingerprint = getRequestFingerprint(ctx.event);
      const redis = useRedis();

      const key = `req_limit:${fingerprint}`;
      const count = await redis.incr(key);
      if (count === 1) {
         await redis.expire(key, 60);
      }

      if (count > timesPerMinute) {
         logger.warn(
            { fingerprint, count },
            'Too many requests, blocking request',
         );
         throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests',
         });
      }

      return next();
   });
};
