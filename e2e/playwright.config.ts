import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE } from './helpers/paths';

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

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
   use: {
      baseURL,
      viewport: { width: 1440, height: 900 },
      screenshot: 'off',
      trace: 'retain-on-failure',
      locale: 'zh-CN',
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
