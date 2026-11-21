import type z from 'zod';
import { JRTP } from '../../protocol/judge-result-transfer-protocal.js';
import { EventType, type IEventMessage } from '../events/index.js';
import { defineTestHandler, getExposePage, System } from '../lib/system.js';
import { replaceDefaultExport } from '../lib/judge-script.js';
import { TaskSchema } from '../schemas/task.js';
import { Singleton } from '../utils/singleton.js';
import { EventEmitterService } from './event-emitter.js';
import { PlaywrightService } from './playwright.js';
import { JudgeCloudFunctions, routeJudgeCloudFunction } from './cloud-function.js';
import { captureProblemDesign } from './problem-design.js';
import { VM } from 'vm2';
import type { BrowserContext } from 'playwright';
import type { JudgeSuccessResultSchema } from '../schemas/judge-result.js';

type JudgeSuccessResult = z.infer<typeof JudgeSuccessResultSchema>;

export class JudgeService extends Singleton {
   static get instance() {
      return this.getInstance<JudgeService>();
   }

   private constructor(
      private readonly eventEmitter = EventEmitterService.instance,
      private readonly jrtp = new JRTP()
   ) {
      super();
   }

   private resourceBaseUrl: string | undefined;

   /** 当前活跃的 WebSocket 上下文；显式只保留一个监听器并按 ws 过滤，避免重连后残留旧监听器导致重复判题。 */
   private activeWs: IEventMessage['MESSAGE']['ws'] | null = null;
   private readonly cloudFunctions = new JudgeCloudFunctions();
   private messageListener: ((msg: IEventMessage['MESSAGE']) => void) | null =
      null;

   async init(resourceBaseUrl: string) {
      this.resourceBaseUrl = resourceBaseUrl;

      // 同一个监听器只注册一次，避免重复注册导致一次任务被判多次
      if (!this.messageListener) {
         this.messageListener = (msg) => {
            void this.handleTask(msg);
         };
         this.eventEmitter.on(EventType.MESSAGE, this.messageListener);
         this.eventEmitter.on(EventType.OPEN, (payload: IEventMessage['OPEN']) => {
            this.activeWs = payload.ws;
         });
         this.eventEmitter.on(EventType.CLOSE, (payload: IEventMessage['CLOSE']) => {
            this.cloudFunctions.closeSocket(payload.ws);
            if (this.activeWs === payload.ws) this.activeWs = null;
         });
      }
   }

   async handleTask(options: IEventMessage['MESSAGE']) {
      const { ws } = options;

      let data: unknown;
      try {
         data = JSON.parse(options.data as string);
      } catch {
         if (this.activeWs && ws !== this.activeWs) return;
         ws.send(
            this.jrtp.pack({
               type: 'error',
               message: 'Invalid JSON format',
               judgeTime: 0,
            })
         );
         return;
      }

      if (data && typeof data === 'object' && 'type' in data && data.type === 'cloud-function-result') {
         this.cloudFunctions.receive(ws, data);
         return;
      }
      // 重连后旧连接可以完成在途 RPC，新判题任务由当前连接承接。
      if (this.activeWs && ws !== this.activeWs) return;

      // Validate the task data
      const validateResult = TaskSchema.safeParse(data);
      if (!validateResult.success) {
         ws.send(
            this.jrtp.pack({
               type: 'error',
               message: validateResult.error.message,
               judgeTime: 0,
            })
         );
         return;
      }
      const payload = validateResult.data;

      // Do judge
      let closePage: (() => Promise<void>) | undefined;
      const startTime = Date.now();
      const setupCloudFunction = (phase?: 'design') => {
         const name = payload.cloudFunctionName;
         if (!name) return undefined;
         const { invoke, close } = this.cloudFunctions.createSession(ws, payload.judgeRecordId, phase);
         return {
            prepare: (context: BrowserContext) => routeJudgeCloudFunction(context, name, invoke),
            close,
         };
      };
      const cloud = setupCloudFunction();
      const cloudOptions = cloud ? { serviceWorkers: 'block' } as const : undefined;
      try {
         const { page, close } = await PlaywrightService.instance.openPage(
            payload.url,
            { contextOptions: cloudOptions, prepareContext: cloud?.prepare },
         );
         closePage = close;
         const viewport = page.viewportSize() ?? undefined;

         const firstScreenshot = await (async () => {
            if (payload.mode === 'judge') return undefined;
            return await page.screenshot({
               fullPage: true,
            });
         })();

         const system = new System(
            payload.mode,
            payload.info,
            this.resourceBaseUrl,
            () => page.screenshot({ type: 'png', fullPage: true, timeout: 2_000 })
         );
         const vm = new VM({
            sandbox: {
               defineTestHandler,
               page: getExposePage(page),
               system,
            },
            timeout: 10 * 1000,
         });
         type TestHandler = ReturnType<typeof defineTestHandler>;
         // 见 lib/judge-script.ts：不能直接 String.replace，注释里的 "export default " 会抢先命中。
         const script = replaceDefaultExport(payload.judgeScript);

         // VM2 的 timeout 打不断 await 中的等待（如 waitForSelector 挂住），故再套一层小于调度器 30s 的硬超时。
         const scriptBudgetMs = 20 * 1000;
         let timer: NodeJS.Timeout | undefined;
         const timeoutGuard = new Promise<never>((_, reject) => {
            timer = setTimeout(
               () =>
                  reject(
                     new Error(
                        `判题脚本执行超过 ${scriptBudgetMs / 1000}s 未完成（可能是页面未加载或选择器一直等待）`,
                     ),
                  ),
               scriptBudgetMs,
            );
         });

         let result: Awaited<ReturnType<TestHandler>>;
         try {
            result = await Promise.race([
               vm.run(`
                  ${script}
                  run(page, system);
               `),
               timeoutGuard,
            ]);
         } finally {
            if (timer) clearTimeout(timer);
         }

         let design: Pick<JudgeSuccessResult, 'designDocument' | 'designError'> = {};
         if (
            payload.mode === 'audit' && payload.designStructure &&
            result.totalScore === payload.designExpectedScore &&
            result.results.every(({ status }) => status === 'pass')
         ) {
            const designCloud = setupCloudFunction('design');
            try {
               const context = await PlaywrightService.instance.newContext(
                  { viewport, ...cloudOptions },
                  designCloud?.prepare,
               );
               design = { designDocument: await captureProblemDesign(context, payload.url, payload.designStructure) };
            } catch (error) {
               console.warn('Problem design capture failed:', error);
               design = { designError: 'capture_failed' };
            } finally {
               designCloud?.close();
            }
         }

         ws.send(
            this.jrtp.pack({
               ...result,
               type: 'done',
               message: 'Judge completed successfully',
               judgeTime: Date.now() - startTime,
               firstScreen: firstScreenshot,
               judgeRecordId: payload.judgeRecordId,
               ...design,
            } satisfies JudgeSuccessResult)
         );
      } catch (error: any) {
         ws.send(
            this.jrtp.pack({
               type: 'error',
               message: error.message,
               judgeTime: Date.now() - startTime,
               judgeRecordId: payload.judgeRecordId,
            })
         );
      } finally {
         cloud?.close();
         await closePage?.().catch(() => {});
      }
   }
}
