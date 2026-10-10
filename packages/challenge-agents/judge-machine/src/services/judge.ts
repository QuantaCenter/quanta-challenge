import type z from 'zod';
import { JRTP } from '../../protocol/judge-result-transfer-protocal.js';
import { EventType, type IEventMessage } from '../events/index.js';
import { defineTestHandler, getExposePage, System } from '../lib/system.js';
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

   /**
    * 当前活跃的 WebSocket 上下文。
    *
    * 历史实现依赖 CLOSE 事件去反注册 MESSAGE 监听，但 CLOSE 携带的 ws 与注册时捕获的
    * 闭包不是同一个引用，反注册常常失败，于是每次重连都会残留一个旧的监听器。
    * 结果：断线重连后，旧监听器仍会处理新连接的消息，导致重复判题 / 响应丢给已关闭的连接。
    * 这里改为显式只保留一个监听器，并按 ws 过滤，确保只处理当前连接的消息。
    */
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
         // 只替换**行首**那个 export default。
         // 用 `String.replace('export default ', ...)` 会在注释里先命中
         // （脚手架模板的注释就写着这个词），真正的 export 留在源码里，
         // vm2 直接报 "'import' and 'export' may appear only with 'sourceType: module'"。
         const script = payload.judgeScript.replace(
            /^[ \t]*export\s+default\s+/m,
            'const run = '
         );

         // VM2 的 timeout 只能中断「同步」执行，无法打断 await 中的异步操作。
         // 一旦判题脚本里的 waitForSelector/click 等一直等待，handleTask 会永久挂住，
         // 既不回结果也不报错，调度器只能等到自己的 30s 超时，
         // 用户看到的就是"未通过 + 空白判题详情"。
         // 因此这里在外面再套一层硬超时（小于调度器 30s），确保一定能发出响应。
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
