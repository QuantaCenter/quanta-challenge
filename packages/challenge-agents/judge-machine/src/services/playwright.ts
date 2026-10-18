import { Singleton } from '../utils/singleton.js';
import {
   chromium,
   type Browser,
   type BrowserContext,
   type Page,
} from 'playwright';

export class PlaywrightService extends Singleton {
   static get instance() {
      return this.getInstance<PlaywrightService>();
   }

   private constructor(
      public instanceCount: number = 1,
      private browsers: Browser[] = new Array(instanceCount).fill(null)
   ) {
      super();
   }

   async init(instanceCount: number = 1) {
      if (instanceCount < 1) {
         throw new Error('Instance count must be at least 1');
      }
      this.instanceCount = instanceCount;
      this.browsers = await Promise.all(
         Array.from({ length: instanceCount }, () =>
            chromium.launch({ headless: true })
         )
      );
   }

   private async pickAliveBrowser() {
      if (this.browsers.length === 0) {
         this.browsers.push(await chromium.launch({ headless: true }));
      }
      const ensureBrowserPoolHealth = async () => {
         for (let i = 0; i < this.browsers.length; i++) {
            if (!this.browsers[i]) {
               this.browsers[i] = await chromium.launch({ headless: true });
            }
         }
      };
      ensureBrowserPoolHealth();
      return this.browsers[0];
   }

   private sanitizeUrl(input: string): string {
      return input
         .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
         .replace(/[\u0000-\u001F\u007F]/g, '')
         .trim();
   }

   /** 单次页面导航超时：Playwright 默认 30s 与调度器等待上限相同会双方同时到期，刻意收紧确保判题机总能先回包。 */
   private navigateTimeoutMs: number = Number(
      process.env.JUDGE_NAVIGATE_TIMEOUT_MS ?? 10_000
   );

   async openPage(
      url: string,
      maxRetries: number = 2
   ): Promise<{
      context: BrowserContext;
      page: Page;
      close: () => Promise<void>;
   }> {
      url = this.sanitizeUrl(url);

      try {
         const browser = await this.pickAliveBrowser();
         const context = await browser.newContext();
         const page = await context.newPage();
         // 显式设置导航与默认操作超时，避免继承 Playwright 的 30s 默认值
         page.setDefaultTimeout(this.navigateTimeoutMs);
         page.setDefaultNavigationTimeout(this.navigateTimeoutMs);
         await page.goto(url, {
            timeout: this.navigateTimeoutMs,
            waitUntil: 'domcontentloaded',
         });
         return {
            context,
            page,
            close: async () => {
               await page.close();
               await context.close();
            },
         };
      } catch (error) {
         console.error(`Error occurred while opening page: ${error}`);
         if (maxRetries <= 0) {
            throw new Error(`Failed to open page after retries: ${url}`);
         }
         if (!(await this.healthCheck(0))) {
            this.browsers.shift();
         }
         return await this.openPage(url, maxRetries - 1);
      }
   }

   async healthCheck(browserIndex: number = 0): Promise<boolean> {
      if (browserIndex < 0 || browserIndex >= this.browsers.length) {
         console.error(`Invalid browser index: ${browserIndex}`);
         return false;
      }
      const browser = this.browsers[browserIndex];

      try {
         const context = await browser.newContext();
         const page = await context.newPage();
         await page.close();
         await context.close();
         return true;
      } catch (error) {
         console.error('Health check failed:', error);
         return false;
      }
   }

   async restart(browserIndex: number = 0) {
      if (browserIndex < 0 || browserIndex >= this.browsers.length) {
         console.error(`Invalid browser index: ${browserIndex}`);
         return false;
      }

      try {
         const browser = this.browsers[browserIndex];
         await browser.close();
         this.browsers[browserIndex] = await chromium.launch({
            headless: true,
         });
         console.log('[INFO] Playwright browser restarted successfully.');
         return true;
      } catch (error) {
         console.error('[ERROR] Failed to restart Playwright browser:', error);
         return false;
      }
   }

   async destroy() {
      await Promise.all(
         this.browsers.map(async (browser) => {
            try {
               await browser.close();
            } catch (error) {
               console.error('Error closing browser:', error);
            }
         })
      );
      this.browsers = [];
   }
}
