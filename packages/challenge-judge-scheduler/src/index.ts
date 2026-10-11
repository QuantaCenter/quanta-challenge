import { serve } from '@hono/node-server';
import app from './controllers/index';
import { initMq } from './mq/index';
import { destroyServices, initServices } from './services/index';
import dotenv from 'dotenv';

// 在服务初始化之前加载 .env，确保 Redis 等服务的环境变量可用
dotenv.config();

const startApp = async () => {
   console.log('正在初始化服务依赖...');
   await initMq();
   await initServices();
   console.log('服务依赖初始化完成');
};

/**
 * 依赖初始化失败时的统一出口。
 *
 * 原实现只 console.error 就继续跑，于是出现最误导人的状态：Hono 仍在 1888 上响应
 * /health 返回 ok，但 MQ / Redis / Docker 全都没就绪，判题机从未启动，
 * 提交的任务永远停在 pending。用户看到"服务是好的"，实际完全不可用。
 * 这里改为显式标记失败并退出进程，让问题在启动阶段就暴露。
 *
 * 注意：唯一不走上这条出口的降级场景是「前端判题机镜像不存在」——
 * 它由 DockerService.init() 转成 WARN + /health degraded（见那里的注释）。
 */
const handleInitFailure = (error: unknown, scene: string) => {
   console.error(
      `\n[FATAL] ${scene} 初始化失败，判题服务无法工作。\n` +
         '常见原因：\n' +
         '  1. PostgreSQL / Redis 未就绪（Docker Desktop 重启后不会自动回来）\n' +
         '     -> docker start quanta-challenge-postgres-1 quanta-challenge-redis-1\n' +
         '  2. 1889 端口被残留的判题机容器占用\n' +
         '     -> docker rm -f $(docker ps -aq --filter ancestor=challenge-judge-machine-agent)\n' +
         '  3. 前端判题机镜像不存在\n' +
         '     -> pnpm --filter @challenge/judge-machine-agent docker:build\n' +
         '        （只跑后端服务题型时不必构建：缺这个镜像会自动降级为 WARN）\n',
      error,
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
      console.log(`[PROD] 尝试启动服务器在端口 ${port}...`);
      serve({ fetch: app.fetch, port })
         .once('close', destroyServices)
         .once('listening', () => {
            console.log(`[INFO] Server is running on http://localhost:${port}`);
         });
   } catch (error) {
      console.error(`[ERROR] 服务器启动失败: ${error}`);
   }
} else {
   startApp().catch((err) => handleInitFailure(err, '[DEV]'));
}

export default app;
