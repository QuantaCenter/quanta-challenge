import type z from 'zod';
import { JRTP } from '../../protocol/judge-result-transfer-protocal.js';
import { EventType, type IEventMessage } from '../events/index.js';
import { defineTestHandler, getExposePage, System } from '../lib/system.js';
import { replaceDefaultExport } from '../lib/judge-script.js';
import { TaskSchema } from '../schemas/task.js';
import { Singleton } from '../utils/singleton.js';
import { EventEmitterService } from './event-emitter.js';
import { PlaywrightService } from './playwright.js';
import { VM } from 'vm2';
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
   private activeWs: unknown = null;
   private messageListener: ((msg: IEventMessage['MESSAGE']) => void) | null =
      null;

   async init(resourceBaseUrl: string) {
      this.resourceBaseUrl = resourceBaseUrl;

      // 同一个监听器只注册一次，避免重复注册导致一次任务被判多次
      if (!this.messageListener) {
         this.messageListener = (msg) => {
            // 只处理当前活跃连接的消息
            if (this.activeWs && msg.ws !== this.activeWs) return;
            void this.handleTask(msg);
         };
         this.eventEmitter.on(EventType.MESSAGE, this.messageListener);
      }

      // 新连接建立时切换活跃连接
      this.eventEmitter.on(EventType.OPEN, (payload: IEventMessage['OPEN']) => {
         this.activeWs = payload.ws;
      });
   }

   async handleTask(options: IEventMessage['MESSAGE']) {
      const { ws } = options;

      let data: Record<string, any>;
      try {
         data = JSON.parse(options.data as string);
      } catch (error: any) {
         ws.send(
            this.jrtp.pack({
               type: 'error',
               message: 'Invalid JSON format',
               judgeTime: 0,
            })
         );
         return;
      }

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
      const cleanupFns = new Array<() => Promise<void>>();
      const startTime = Date.now();
      try {
         const { page, close } = await PlaywrightService.instance.openPage(
            payload.url
         );
         cleanupFns.push(() => close());

         const firstScreenshot = await (async () => {
            if (payload.mode === 'judge') return undefined;
            return await page.screenshot({
               fullPage: true,
            });
         })();

         const system = new System(
            payload.mode,
            payload.info,
            this.resourceBaseUrl
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

         ws.send(
            this.jrtp.pack({
               ...result,
               type: 'done',
               message: 'Judge completed successfully',
               judgeTime: Date.now() - startTime,
               firstScreen: firstScreenshot,
               judgeRecordId: payload.judgeRecordId,
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
      }

      cleanupFns.forEach((fn) => fn());
   }
}
