import { serve } from '@hono/node-server';
import app from './controllers/index';
import { initMq } from './mq/index';
import { destroyServices, initServices } from './services/index';
import { logger } from './utils/logger';
import dotenv from 'dotenv';

// 在服务初始化之前加载 .env，确保 Redis 等服务的环境变量可用
dotenv.config();

const startApp = async () => {
   logger.info('正在初始化服务依赖...');
   await initMq();
   await initServices();
   logger.info('服务依赖初始化完成');
};

/** 依赖初始化失败时的统一出口：显式标记失败并退出，避免 /health 正常但依赖未就绪的假象。 */
const handleInitFailure = (error: unknown, scene: string) => {
   logger.fatal(
      { err: error },
      `${scene} 初始化失败，判题服务无法工作。\n` +
         '常见原因：\n' +
         '  1. PostgreSQL / Redis 未就绪（Docker Desktop 重启后不会自动回来）\n' +
         '     -> docker start quanta-challenge-postgres-1 quanta-challenge-redis-1\n' +
         '  2. 1889 端口被残留的判题机容器占用\n' +
         '     -> docker rm -f $(docker ps -aq --filter ancestor=challenge-judge-machine-agent)\n' +
         '  3. 前端判题机镜像不存在\n' +
         '     -> pnpm --filter @challenge/judge-machine-agent docker:build\n' +
         '        （只跑后端服务题型时不必构建：缺这个镜像会自动降级为 WARN）',
   );
   process.exit(1);
};

if (process.env.NODE_ENV === 'production') {
   try {
      await startApp();
   } catch (error) {
      handleInitFailure(error, '[PROD]');
   }

   const port = Number(process.env.PORT ?? 3000);
   try {
      logger.info(`尝试启动服务器在端口 ${port}...`);
      serve({ fetch: app.fetch, port })
         .once('close', destroyServices)
         .once('listening', () => {
            logger.info(`Server is running on http://localhost:${port}`);
         });
   } catch (error) {
      logger.error({ err: error }, '服务器启动失败');
   }
} else {
   startApp().catch((err) => handleInitFailure(err, '[DEV]'));
}

export default app;
