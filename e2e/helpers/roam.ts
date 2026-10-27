import type { Page } from '@playwright/test';
import { SCREENSHOT_DIR } from './paths';
import fs from 'node:fs';
import path from 'node:path';

export async function roamAndScreenshot(page: Page, route: string, group: string) {
   const slug = route
      .replace(/^\/+/, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
   const dir = path.join(SCREENSHOT_DIR, group);
   fs.mkdirSync(dir, { recursive: true });
   const file = path.join(dir, `${slug}.png`);

   try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`📸 ${route} → ${path.relative(process.cwd(), file)}`);
   } catch (error) {
      const errorFile = path.join(dir, `${slug}_error.png`);
      await page
         .screenshot({ path: errorFile, fullPage: true })
         .catch(() => {});
      console.warn(
         `⚠️ ${route} 导航/截图失败（已截图留证 ${path.basename(errorFile)}）:`,
         error instanceof Error ? error.message : error,
      );
   }
}
