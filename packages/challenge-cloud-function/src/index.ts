import { serve } from '@hono/node-server';
import app from './controllers/index';
import { config } from './config';
import { executor } from './services/executor';
import { closeRedis, getRedis } from './services/redis';
import { initRegistrySubscriber } from './services/registry';
import { logger } from './utils/logger';

/**
 * 依赖初始化。
 *
 * 与 judge-scheduler 的教训一致：依赖没就绪时**必须启动失败**，
 * 而不是让服务在端口上"看似正常"却什么都做不了。
 */
const initServices = async (): Promise<void> => {
   logger.info('正在初始化云函数服务依赖...');

   await getRedis().ping();
   await executor.init();
   initRegistrySubscriber();

   logger.info('依赖初始化完成');
};

const shutdown = async (signal: string): Promise<void> => {
   logger.info({ signal }, '收到退出信号，正在优雅关闭');
   await executor.destroy().catch(() => undefined);
   await closeRedis().catch(() => undefined);
};

if (config.isProduction) {
   // 生产：本进程自己监听 HTTP。
   try {
      await initServices();
   } catch (error) {
      logger.error({ error }, '云函数服务依赖初始化失败，进程退出');
      process.exit(1);
   }

   const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
      logger.info(
         { port: info.port, env: config.nodeEnv },
         `云函数服务已启动：http://localhost:${info.port}`,
      );
   });

   process.on('SIGTERM', () => {
      void shutdown('SIGTERM').finally(() => {
         server.close();
         process.exit(0);
      });
   });
   process.on('SIGINT', () => {
      void shutdown('SIGINT').finally(() => {
         server.close();
         process.exit(0);
      });
   });
} else {
   // 开发：HTTP 由 @hono/vite-dev-server 提供，这里只初始化依赖，
   // **不要**再 serve()，否则会和 vite 的 dev server 抢端口/起两个服务。
   void initServices().catch((error) => {
      logger.error({ error }, '云函数服务依赖初始化失败，进程退出');
      process.exit(1);
   });
}

export default app;
