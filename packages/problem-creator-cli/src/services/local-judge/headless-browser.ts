import type { Browser } from 'playwright-core';

import { CliError } from '../../core/errors';

export const BROWSER_INSTALL_HINT =
   '安装判题同版本的 Chromium：`npx playwright@1.54.1 install chromium`（或安装 Google Chrome / Microsoft Edge），然后重跑。';

/** 依次尝试 Playwright 自带 Chromium、本机 Chrome、本机 Edge；都没有时抛出带安装提示的错误。 */
export const launchHeadlessBrowser = async (): Promise<Browser> => {
   const { chromium } = await import('playwright-core');
   const attempts: Array<{ label: string; channel?: string }> = [
      { label: 'Playwright Chromium' },
      { label: 'Google Chrome', channel: 'chrome' },
      { label: 'Microsoft Edge', channel: 'msedge' },
   ];
   const reasons: string[] = [];
   for (const attempt of attempts) {
      try {
         return await chromium.launch({
            headless: true,
            ...(attempt.channel ? { channel: attempt.channel } : {}),
         });
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);
         reasons.push(`${attempt.label}: ${message.split('\n')[0]}`);
      }
   }
   throw new CliError('找不到可用的无头浏览器', {
      hint: BROWSER_INSTALL_HINT,
      details: { code: 'BROWSER_UNAVAILABLE', reasons },
   });
};
