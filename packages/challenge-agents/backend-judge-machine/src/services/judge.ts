import type z from 'zod';
import { VM } from 'vm2';
import { JRTP } from '../../protocol/judge-result-transfer-protocal.js';
import { EventType, type IEventMessage } from '../events/index.js';
import { defineTestHandler, HttpClient, System } from '../lib/system.js';
import { replaceDefaultExport } from '../lib/judge-script.js';
import type { JudgeSuccessResultSchema } from '../schemas/judge-result.js';
import { TaskSchema } from '../schemas/task.js';
import { Singleton } from '../utils/singleton.js';
import { EventEmitterService } from './event-emitter.js';

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

   /** 单请求超时。 */
   private readonly requestTimeoutMs = Number(
      process.env.BACKEND_JUDGE_REQUEST_TIMEOUT_MS ?? 10_000
   );

   /** 单响应体上限（字节）。 */
   private readonly maxResponseBytes = Number(
      process.env.BACKEND_JUDGE_MAX_RESPONSE_BYTES ?? 2 * 1024 * 1024
   );

   /** 脚本总预算：VM2 的 timeout 打不断 await 里的慢请求，再套一层硬超时确保能在调度器超时前回包。 */
   private readonly scriptBudgetMs = Number(
      process.env.BACKEND_JUDGE_SCRIPT_BUDGET_MS ?? 20_000
   );

   private activeWs: unknown = null;
   private messageListener: ((msg: IEventMessage['MESSAGE']) => void) | null =
      null;

   async init() {
      if (!this.messageListener) {
         this.messageListener = (msg) => {
            if (this.activeWs && msg.ws !== this.activeWs) return;
            void this.handleTask(msg);
         };
         this.eventEmitter.on(EventType.MESSAGE, this.messageListener);
      }

      this.eventEmitter.on(EventType.OPEN, (payload: IEventMessage['OPEN']) => {
         this.activeWs = payload.ws;
      });
   }

   async handleTask(options: IEventMessage['MESSAGE']) {
      const { ws } = options;

      let data: Record<string, any>;
      try {
         data = JSON.parse(options.data as string);
      } catch {
         ws.send(
            this.jrtp.pack({
               type: 'error',
               message: 'Invalid JSON format',
               judgeTime: 0,
            })
         );
         return;
      }

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

      const startTime = Date.now();
      try {
         const http = new HttpClient({
            baseUrl: payload.url,
            timeoutMs: this.requestTimeoutMs,
            maxBytes: this.maxResponseBytes,
         });
         const system = new System(payload.mode, payload.info);

         const vm = new VM({
            sandbox: {
               defineTestHandler,
               http,
               system,
            },
            timeout: 10 * 1000,
         });

         type TestHandler = ReturnType<typeof defineTestHandler>;
         // 见 lib/judge-script.ts：不能直接 String.replace，注释里的 "export default " 会抢先命中。
         const script = replaceDefaultExport(payload.judgeScript);

         let timer: NodeJS.Timeout | undefined;
         const timeoutGuard = new Promise<never>((_, reject) => {
            timer = setTimeout(
               () =>
                  reject(
                     new Error(
                        `判题脚本执行超过 ${this.scriptBudgetMs / 1000}s 未完成（可能是接口一直无响应）`
                     )
                  ),
               this.scriptBudgetMs
            );
         });

         let result: Awaited<ReturnType<TestHandler>>;
         try {
            result = await Promise.race([
               vm.run(`
                  ${script}
                  run(http, system);
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
   }
}
