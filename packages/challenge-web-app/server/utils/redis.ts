import Redis from 'ioredis';
import { logger } from '~~/server/utils/logger';

let redis: Redis | null = null;

const initRedis = () => {
   const {
      redis: {
         host: redisHost,
         port: redisPort,
         password: redisPassword,
         username: redisUsername,
      },
   } = useRuntimeConfig();

   logger.info(
      { host: redisHost, port: redisPort },
      'Successfully get redis config',
   );

   if (!redisHost || !redisPort) {
      logger.error('Redis host or port is not defined in runtime config');
      throw new Error('Redis host or port is not defined in runtime config');
   }

   redis = new Redis({
      host: redisHost,
      port: redisPort,
      username: redisUsername || undefined,
      password: redisPassword || undefined,
   });
};

export const useRedis = () => {
   if (!redis) {
      initRedis();
   }
   return redis!;
};
