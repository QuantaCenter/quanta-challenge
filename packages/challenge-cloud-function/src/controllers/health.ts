import { Hono } from 'hono';
import { executor } from '../services/executor';
import { getRedis } from '../services/redis';
import prisma from '../utils/prisma';

const healthRoute = new Hono();

/**
 * 健康检查。
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
