import IORedis from 'ioredis';
import type { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

/** Redis 连接（单例）：所有 key 以 `cf:` 开头与 web-app 业务缓存互不干扰，也可用 CF_REDIS_DB 指定独立逻辑库。 */
let client: Redis | null = null;

export const getRedis = (): Redis => {
   if (client) return client;

   client = new IORedis({
      host: config.redis.host,
      port: config.redis.port,
      username: config.redis.username || undefined,
      password: config.redis.password || undefined,
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
   });

   client.on('error', (error) => {
      logger.error({ error: error.message }, 'Redis 连接错误');
   });

   return client;
};

/** 独立的订阅连接（订阅连接不能复用于普通命令）。 */
let subscriber: Redis | null = null;

export const getSubscriber = (): Redis => {
   if (subscriber) return subscriber;
   subscriber = getRedis().duplicate();
   subscriber.on('error', (error) => {
      logger.error({ error: error.message }, 'Redis 订阅连接错误');
   });
   return subscriber;
};

export const closeRedis = async (): Promise<void> => {
   await client?.quit().catch(() => client?.disconnect());
   await subscriber?.quit().catch(() => subscriber?.disconnect());
   client = null;
   subscriber = null;
};
