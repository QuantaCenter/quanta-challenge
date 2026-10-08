import { Hono } from 'hono';
import { executor } from '../services/executor';
import { getRedis } from '../services/redis';
import prisma from '../utils/prisma';

const healthRoute = new Hono();

/**
 * 健康检查。
 *
 * 刻意**实际 ping** Redis 与 Postgres，而不是永远返回 ok：
 * judge-scheduler 曾出现"Hono 在 1888 返回 ok，但 MQ/Redis/Docker 全没就绪"的假健康状态，
 * 本服务不重蹈覆辙——依赖不可用时返回 503。
 */
healthRoute.get('/', async (c) => {
   let redisOk = false;
   let dbOk = false;

   try {
      await getRedis().ping();
      redisOk = true;
   } catch {
      redisOk = false;
   }

   try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
   } catch {
      dbOk = false;
   }

   const workers = executor.stats;
   const ok = redisOk && dbOk;

   return c.json(
      {
         ok,
         redis: redisOk ? 'ok' : 'error',
         db: dbOk ? 'ok' : 'error',
         workers,
      },
      ok ? 200 : 503,
   );
});

export default healthRoute;
