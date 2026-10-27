/** dev server 看护进程：nuxt dev 可能被 HMR 断连引发的连接层错误终止，这里自动重启；按连续快速失败次数做指数退避（1.5s→30s），一次健康运行即清零。用法：pnpm dev:watch。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** 首次重启延迟 */
const BASE_DELAY_MS = 1500;
/** 退避上限 */
const MAX_DELAY_MS = 30_000;
/** 运行超过该时长即视为"启动成功过"，重置退避计数 */
const HEALTHY_RUN_MS = 20_000;

let consecutiveFastFailures = 0;
let shuttingDown = false;
let child = null;
let startedAt = 0;

const nuxtBin = path.join(projectRoot, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs');

const start = () => {
   startedAt = Date.now();
   child = spawn(process.execPath, [nuxtBin, 'dev', '--host'], {
      cwd: projectRoot,
      // 直接继承 stdio：输出实时可见，也避免在受限环境下尝试创建管道
      stdio: 'inherit',
      env: process.env,
   });

   child.on('exit', (code, signal) => {
      if (shuttingDown) return;

      const ranFor = Date.now() - startedAt;
      const wasHealthy = ranFor >= HEALTHY_RUN_MS;

      if (wasHealthy) {
         // 正常跑过一段时间后才挂：属于偶发，重置退避
         consecutiveFastFailures = 0;
      } else {
         consecutiveFastFailures += 1;
      }

      const delay = Math.min(
         BASE_DELAY_MS * 2 ** Math.max(0, consecutiveFastFailures - 1),
         MAX_DELAY_MS,
      );

      const reason = signal ? `被信号 ${signal} 终止` : `退出码 ${code}`;
      console.error(
         `\n[watchdog] nuxt dev ${reason}（运行了 ${Math.round(ranFor / 1000)}s），` +
            `${Math.round(delay / 1000)}s 后重启` +
            (consecutiveFastFailures > 1
               ? `（连续快速失败 ${consecutiveFastFailures} 次）`
               : '') +
            '…',
      );

      if (consecutiveFastFailures >= 3) {
         console.error(
            '[watchdog] ⚠️ 已连续快速失败多次，退避时间已延长。\n' +
               '           请查看上方日志中的 ERROR。常见原因：\n' +
               '             · 语法/编译错误（Vite: Transform failed）\n' +
               '             · JavaScript heap out of memory（内存不足，' +
               '可先关掉其它 dev 实例；不要与 pnpm typecheck 同时跑，' +
               '二者都会写 .nuxt/）\n' +
               '             · 端口被其它实例占用\n',
         );
      }

      setTimeout(start, delay);
   });
};

// Ctrl+C / 关闭窗口时，连同子进程一起退出，不要留下孤儿进程
const shutdown = () => {
   shuttingDown = true;
   if (child && !child.killed) {
      child.kill();
   }
   process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[watchdog] 启动 nuxt dev（退出后按指数退避自动重启）…');
start();
