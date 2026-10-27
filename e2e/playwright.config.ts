import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE } from './helpers/paths';

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
// 本地开发可用 E2E_BROWSER_CHANNEL=chrome 直接使用系统 Chrome，免下载浏览器；
// CI（Playwright 官方镜像）不设置该变量，使用镜像内置的 chromium。
const browserChannel = process.env.E2E_BROWSER_CHANNEL;

export default defineConfig({
   testDir: './tests',
   timeout: 90_000,
   expect: { timeout: 10_000 },
   fullyParallel: false,
   workers: 1,
   retries: 0,
   forbidOnly: !!process.env.CI,
   outputDir: 'test-results',
   reporter: process.env.CI
      ? [['list'], ['html', { open: 'never' }]]
      : [['list'], ['html', { open: 'on-failure' }]],
   // channel 放在顶层 use：所有 project（含 setup）共享
   use: {
      baseURL,
      viewport: { width: 1440, height: 900 },
      screenshot: 'off',
      trace: 'retain-on-failure',
      locale: 'zh-CN',
      ...(browserChannel ? { channel: browserChannel } : {}),
   },
   projects: [
      {
         name: 'setup',
         testMatch: /auth\.setup\.ts/,
      },
      {
         name: 'chromium',
         use: {
            ...devices['Desktop Chrome'],
            storageState: AUTH_FILE,
         },
         dependencies: ['setup'],
      },
   ],
});
