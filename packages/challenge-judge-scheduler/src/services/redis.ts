import { Singleton } from '../utils/singleton';
import IORedis from 'ioredis';
import type { Redis } from 'ioredis';

const env = (key: string, defaultValue: string): string => {
   return process.env[key] || defaultValue;
};

export class RedisService extends Singleton {
   static get instance() {
      return super.getInstance<RedisService>();
   }

   private constructor(
      public readonly host = env('REDIS_HOST', 'localhost'),
      public readonly port = parseInt(env('REDIS_PORT', '6379'), 10),
      public readonly password = env('REDIS_PASSWORD', ''),
      // 实例类型用 ioredis 导出的 Redis 类型； 原写法 IORedis.Redis 在运行时可用（默认导出上确实挂了 Redis 构造函数）， 但 ioredis 的类型定义里没有这个命名空间，导致 tsc 报 TS2702/TS2339。
      public readonly redis: Redis
   ) {
      super();
      this.redis = new IORedis({
         host: this.host,
         port: this.port,
         password: this.password || undefined,
      });
   }

   destroy() {
      this.redis.disconnect();
   }
}
