import { Hono } from 'hono';
import { loadEnv } from '../middlewares/env';
import taskRoute from './task';
import codeRoute from './code';
import cacheRoute from './cache';
import { globalExpectionFilter } from '../filters/gloabl-expection-filter';
import { DockerService } from '../services/docker';

const app = new Hono();

app.use('*', loadEnv());

app.onError(globalExpectionFilter);

app.route('/task', taskRoute);
app.route('/code', codeRoute);
app.route('/cache', cacheRoute);

// 只回 { status: 'ok' } 是危险的：调度器降级运行时（例如前端判题机镜像没构建），
// 任何探测者都会以为一切正常，而前端题型实际全挂。这里把判题机状态一并暴露，
// 缺镜像时 status 变为 degraded。
//
// 仍返回 HTTP 200：degraded 不是「进程已死」，用它触发重启只会让降级环境无法启动。
app.get('/health', (c) => {
   const judgeMachine = DockerService.instance.judgeMachine;
   return c.json({
      status: judgeMachine.available ? 'ok' : 'degraded',
      judgeMachine,
   });
});

export default app;
