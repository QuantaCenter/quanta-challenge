import z from 'zod';
import type { Page } from 'playwright';
import { diff, Jimp } from 'jimp';

type BuildProxyProps<
   Mode extends 'pick' | 'omit',
   Target extends Record<string, any>,
   K extends keyof Target = keyof Target
> = Mode extends 'pick' ? Pick<Target, K> : Omit<Target, K>;

export const buildProxy = <
   Target extends Record<string, any>,
   Mode extends 'pick' | 'omit',
   K extends keyof Target = keyof Target
>(
   target: Target,
   props: K[],
   mode: Mode = 'pick' as Mode
): BuildProxyProps<Mode, Target, K> => {
   const keySet = new Set(props);
   const result = {} as BuildProxyProps<Mode, Target, K>;

   const shouldInclude =
      mode === 'pick'
         ? (key: string | symbol) => keySet.has(key as K)
         : (key: string | symbol) => !keySet.has(key as K);

   // 获取所有键（包括原型链上的可枚举属性）
   const allKeys = [
      ...Object.getOwnPropertyNames(target),
      ...Object.getOwnPropertySymbols(target),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(target) || {}),
   ].filter((key, index, arr) => arr.indexOf(key) === index); // 去重

   for (const key of allKeys) {
      if (shouldInclude(key)) {
         const value = target[key as keyof Target];
         if (typeof value === 'function') {
            // 绑定函数到原始对象
            (result as any)[key] = (...args: any[]) =>
               value.bind(target)(...args);
         } else {
            // 直接复制属性值
            (result as any)[key] = value;
         }
      }
   }

   return result;
};

const SaveImageSchema = z.object({
   type: z.literal('image'),
   buffer: z.instanceof(Buffer),
   name: z
      .string()
      .optional()
      .refine((val) => typeof val === 'undefined' || val.endsWith('.png')),
});

const SaveSchema = z.discriminatedUnion('type', [SaveImageSchema]);
type SaveType = z.infer<typeof SaveSchema>;

/** `page.waitForNetworkIdle` 的超时上限（毫秒）。 */
export const MAX_NETWORK_IDLE_TIMEOUT_MS = 5_000;

/** 默认超时（毫秒）。 */
const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 3_000;

/** 在途请求归零后需保持的静默时长（毫秒）。 */
const NETWORK_IDLE_QUIET_MS = 500;

/** 轮询间隔（毫秒）。 */
const NETWORK_IDLE_POLL_MS = 50;

const WaitForNetworkIdleOptionsSchema = z.object({
   timeout: z
      .number('timeout 必须是数字')
      .int('timeout 必须是整数')
      .positive('timeout 必须大于 0')
      .max(
         MAX_NETWORK_IDLE_TIMEOUT_MS,
         `timeout 不能超过 ${MAX_NETWORK_IDLE_TIMEOUT_MS}ms`
      )
      .optional(),
});

export type WaitForNetworkIdleOptions = z.infer<
   typeof WaitForNetworkIdleOptionsSchema
>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 等待网络静默：在途请求归零并保持 {@link NETWORK_IDLE_QUIET_MS} 后返回 true，超时返回 false；只统计调用之后发出的请求。 */
export const waitForNetworkIdle = async (
   page: Page,
   options: WaitForNetworkIdleOptions = {}
): Promise<boolean> => {
   // 抛普通 Error：ZodError 的 message 是 JSON，会被拼进测试点失败原因展示。
   const parsed = WaitForNetworkIdleOptionsSchema.safeParse(options);
   if (!parsed.success) {
      const reasons = parsed.error.issues
         .map((issue) => issue.message)
         .join('；');
      throw new Error(`page.waitForNetworkIdle 参数无效：${reasons}`);
   }
   const { timeout = DEFAULT_NETWORK_IDLE_TIMEOUT_MS } = parsed.data;

   const inflight = new Set<unknown>();
   const track = (request: unknown) => void inflight.add(request);
   const settle = (request: unknown) => void inflight.delete(request);

   // 必须在任何 await 之前挂载，否则调用方随后触发的请求会漏统计。
   page.on('request', track);
   page.on('requestfinished', settle);
   page.on('requestfailed', settle);

   const deadline = Date.now() + timeout;
   let quietSince: number | null = null;
   try {
      while (Date.now() < deadline) {
         if (inflight.size > 0) {
            quietSince = null;
         } else {
            quietSince ??= Date.now();
            if (Date.now() - quietSince >= NETWORK_IDLE_QUIET_MS) return true;
         }
         await sleep(NETWORK_IDLE_POLL_MS);
      }
      return false;
   } finally {
      page.off('request', track);
      page.off('requestfinished', settle);
      page.off('requestfailed', settle);
   }
};

const generateUUID = () => {
   return crypto.randomUUID();
};

interface IDefineCheckPointCtx {
   score: {
      increment: (increment: number) => void;
      set: (value: number) => void;
      get: () => number;
   };
}

export class System {
   _checkPoints: Array<{
      name: string;
      totalScore: number;
      passScore: number;
      handler: (
         ctx: IDefineCheckPointCtx
      ) => Promise<number | void> | number | void;
   }> = [];

   files: Record<string, Buffer> = {};

   getAndCleanupFiles() {
      const files = this.files;
      this.files = {};
      return files;
   }

   constructor(
      public readonly mode: 'audit' | 'judge',
      public readonly info: Record<string, string> = {},
      public readonly resourceBaseUrl: string = ''
   ) {}

   async saveOrCompare(type: SaveType) {
      SaveSchema.parse(type);
      if (type.type === 'image') {
         const fn = this.mode === 'audit' ? this.saveImage : this.compareImage;
         return await fn.call(this, type.buffer, type.name as any);
      }
   }

   defineCheckPoint(
      name: string,
      totalScore: number,
      handler: (
         ctx: IDefineCheckPointCtx
      ) => Promise<number | void> | number | void,
      options?: {
         passScore?: number;
         passScoreRate?: number;
      }
   ) {
      let passScore = totalScore;
      if (options?.passScore) {
         passScore = options.passScore;
      } else if (options?.passScoreRate) {
         passScore = options.passScoreRate * totalScore;
      }

      this._checkPoints.push({ name, passScore, handler, totalScore });
   }

   expect(expression: any | (() => any), desc: string) {
      const result =
         typeof expression === 'function' ? expression() : expression;
      if (!result) {
         throw new Error(`“${desc}”不符合要求`);
      }
   }

   private async fetchFile(name: string): Promise<ArrayBuffer> {
      return await fetch(`${this.resourceBaseUrl}/${name}`)
         .then((res) => res.arrayBuffer())
         .catch(() => {
            throw new Error(`Failed to fetch file: ${name}`);
         });
   }

   async compareImage(buffer: Buffer, name: `${string}.png`) {
      const templateImgUrl = this.info[name];
      const templateImage = await this.fetchFile(templateImgUrl);

      const templateData = await Jimp.read(templateImage);
      const providedImage = await Jimp.read(buffer);
      const { percent } = diff(templateData, providedImage);

      this.files[name] = buffer;
      return 1 - percent;
   }

   async saveImage(
      buffer: Buffer,
      name: `${string}.png` = `${generateUUID()}.png`
   ) {
      if (buffer.length > 5 * 1024 * 1024) {
         throw new Error('Image size exceeds 5MB limit');
      }
      this.files[name] = buffer;
      return 1; // 返回相似度 1 表示完全相同
   }

   async score(totalScore: number, rating: () => number) {
      const rate = rating();
      const score = Math.max(0, Math.min(rate, 1)) * totalScore;
      return score;
   }
}

const getExposeSystem = (sys: System) => {
   return {
      saveOrCompare: sys.saveOrCompare.bind(sys),
      score: sys.score.bind(sys),
      defineCheckPoint: sys.defineCheckPoint.bind(sys),
      expect: sys.expect.bind(sys),
   };
};

interface IHandlerCtx {
   page: ExposePage;
   $: ReturnType<typeof getExposeSystem>;
}

interface ITestResult {
   score: number;
   totalScore: number;
   details: string;
   status: 'pass' | 'fail';
   cacheFiles: Record<string, Buffer>;
}

export const getExposePage = (page: Page) => {
   const exposed = buildProxy(page, ['goto'], 'omit');
   // 在受限 Page 上补一个平台方法：Playwright 没有等网络静默的能力。
   return Object.assign(exposed, {
      waitForNetworkIdle: (options?: WaitForNetworkIdleOptions) =>
         waitForNetworkIdle(page, options),
   });
};
export type ExposePage = ReturnType<typeof getExposePage>;

export const defineTestHandler = (
   handler: (ctx: IHandlerCtx) => Promise<void>
) => {
   return async (page: ExposePage, system: System) => {
      await handler({
         page,
         $: getExposeSystem(system),
      });
      const { _checkPoints } = system;
      system._checkPoints = [];
      const results: ITestResult[] = [];
      for (const checkPoint of _checkPoints) {
         let score = 0;
         try {
            const successScore = await checkPoint.handler({
               score: {
                  increment: (increment) => {
                     score += increment;
                  },
                  set: (value) => {
                     score = value;
                  },
                  get: () => score,
               },
            });
            score = successScore ?? score;
            results.push({
               score,
               totalScore: checkPoint.totalScore,
               details: `测试点“${checkPoint.name}”分数为 ${checkPoint.totalScore}，得分为 ${score} 。`,
               status: score >= checkPoint.passScore ? 'pass' : 'fail',
               cacheFiles: system.getAndCleanupFiles(),
            });
         } catch (error: any) {
            results.push({
               score,
               totalScore: checkPoint.totalScore,
               details: `测试点“${checkPoint.name}”失败，原因是：${error.message}。`,
               status: 'fail',
               cacheFiles: system.getAndCleanupFiles(),
            });
         }
      }
      return {
         results,
         totalScore: results.reduce((sum, res) => sum + res.score, 0),
         maxScore: Math.max(...results.map((res) => res.score)),
         status: (results.every((res) => res.status === 'pass')
            ? 'completed'
            : 'fail') as 'completed' | 'fail',
      };
   };
};
