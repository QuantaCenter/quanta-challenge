import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 单测配置。
 *
 * 在这之前本包**没有任何 vitest 配置**，`pnpm test` 会直接用 vite 默认解析规则跑，
 * 于是 server 端代码里的 Nuxt 别名（`~~/lib/logger`、`~~/lib/prisma`、`~/...`）
 * 全部解析失败，表现是：
 *
 *   Error: Cannot find module '~~/lib/logger' imported from
 *   .../server/trpc/services/utils/achievement-observer.ts
 *
 * 结果所有引用了别名的 spec（例如成就观察者）连"收集"阶段都过不去，
 * 报告成 `Test Files 1 failed / Tests no tests` —— 看起来像测试失败，
 * 实际是测试一条都没跑起来。
 *
 * 这里把 Nuxt 的目录别名按下面这张对照表手工映射（Nuxt 4 默认 srcDir = `app/`）：
 *
 *   ~   / @   → packages/challenge-web-app/app
 *   ~~  / @@  → packages/challenge-web-app
 *
 * 注意：**不要**照抄 nuxt.config.ts 里 `path → path-browserify` 那条别名。
 * 那是给浏览器端打包用的；单测跑在 Node 环境，服务端代码需要真正的 `node:path`。
 */
const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const appDir = fileURLToPath(new URL('./app', import.meta.url));

export default defineConfig({
   resolve: {
      alias: {
         '~~': packageRoot,
         '@@': packageRoot,
         '~': appDir,
         '@': appDir,
      },
   },
   test: {
      environment: 'node',
      // 这些 spec 都是纯单测（prisma 一律 mock / 代理），不需要真实数据库
      include: ['{app,server,lib}/**/*.{test,spec}.ts'],
      // 只跑测试目录里的 spec；fixture（redis 替身）不匹配 *.spec.ts，不会被当测试收集
      exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/dist/**'],
      // 设备授权用例含真实计时（轮询间隔累加），默认 5s 会误报超时
      testTimeout: 15_000,
   },
});
