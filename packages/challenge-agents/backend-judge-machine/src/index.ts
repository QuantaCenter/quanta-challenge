import { serve } from '@hono/node-server';
import { app, injectWebSocket } from './controllers/index.js';
import { JudgeService } from './services/judge.js';

// 后端判题机不启动 Playwright，也不需要从 Web 应用拉静态资源，
// 因此初始化只注册 WebSocket 消息分发。
JudgeService.instance.init();

const server = serve(
   {
      fetch: app.fetch,
      port: 3000,
      hostname: '0.0.0.0',
   },
   (info) => {
      console.log(
         `[INFO] Backend judge machine is running on http://challenge-backend-judge-machine:${info.port}`
      );
   }
);
injectWebSocket(server);

process.on('unhandledRejection', (error) => {
   console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
   console.error('Uncaught Exception:', error);
});

export default app;
