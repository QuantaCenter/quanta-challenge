import { createContext, runInContext } from 'node:vm';

import type { Page } from 'playwright-core';

import { replaceDefaultExport } from '../../domain/judge-script';

// 本文件是判题机运行时的本地镜像（judge-machine / backend-judge-machine 的 lib/system.ts）：
// 语义必须与线上一致，否则本地满分、线上失败，本地判题就失去意义。

/** 线上判题脚本总预算：超时则所有检查点作废 */
export const SCRIPT_BUDGET_MS = 20_000;
/** 线上 Playwright 的导航与默认操作超时 */
export const NAVIGATE_TIMEOUT_MS = 10_000;

const MAX_NETWORK_IDLE_TIMEOUT_MS = 5_000;
const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 3_000;
const NETWORK_IDLE_QUIET_MS = 500;
const NETWORK_IDLE_POLL_MS = 50;

type CheckPointHandler = (ctx: {
   score: {
      increment: (increment: number) => void;
      set: (value: number) => void;
      get: () => number;
   };
}) => Promise<number | undefined> | number | undefined;

interface CheckPoint {
   name: string;
   totalScore: number;
   passScore: number;
   handler: CheckPointHandler;
}

export interface CheckPointResult {
   name: string;
   score: number;
   totalScore: number;
   status: 'pass' | 'fail';
   details: string;
   durationMs: number;
}

export interface ScriptResult {
   results: CheckPointResult[];
   score: number;
}

class LocalSystem {
   checkPoints: CheckPoint[] = [];

   defineCheckPoint(
      name: string,
      totalScore: number,
      handler: CheckPointHandler,
      options?: { passScore?: number; passScoreRate?: number },
   ): void {
      let passScore = totalScore;
      if (options?.passScore) passScore = options.passScore;
      else if (options?.passScoreRate) {
         passScore = options.passScoreRate * totalScore;
      }
      this.checkPoints.push({ name, totalScore, passScore, handler });
   }

   expect(expression: unknown, desc: string): void {
      const result =
         typeof expression === 'function' ? expression() : expression;
      if (!result) throw new Error(`“${desc}”不符合要求`);
   }

   async score(totalScore: number, rating: () => number): Promise<number> {
      return Math.max(0, Math.min(rating(), 1)) * totalScore;
   }

   /** 审计模式：只校验参数并视为完全相同（线上审计时存图，判题时才比对） */
   async saveOrCompare(input: {
      type: 'image';
      buffer: Buffer;
      name?: string;
   }): Promise<number> {
      if (input?.type !== 'image' || !Buffer.isBuffer(input.buffer)) {
         throw new Error(
            'saveOrCompare 参数无效：需要 { type: "image", buffer }',
         );
      }
      if (input.name !== undefined && !input.name.endsWith('.png')) {
         throw new Error('saveOrCompare 的 name 必须以 .png 结尾');
      }
      if (input.buffer.length > 5 * 1024 * 1024) {
         throw new Error('Image size exceeds 5MB limit');
      }
      return 1;
   }

   /** 线上把附件存进判题详情；本地无处展示，只保持返回值一致 */
   save(): number {
      return 1;
   }
}

const exposeFrontendSystem = (sys: LocalSystem) => ({
   saveOrCompare: sys.saveOrCompare.bind(sys),
   score: sys.score.bind(sys),
   defineCheckPoint: sys.defineCheckPoint.bind(sys),
   expect: sys.expect.bind(sys),
});

const exposeBackendSystem = (sys: LocalSystem) => ({
   save: sys.save.bind(sys),
   score: sys.score.bind(sys),
   defineCheckPoint: sys.defineCheckPoint.bind(sys),
   expect: sys.expect.bind(sys),
});

/** 与线上 buildProxy 相同：只拷贝自身属性与一层原型上的属性，因此 page.on 等继承方法线上不可用。 */
const buildProxy = <T extends object>(target: T, omit: string[]) => {
   const result: Record<string | symbol, unknown> = {};
   const keys = [
      ...Object.getOwnPropertyNames(target),
      ...Object.getOwnPropertySymbols(target),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(target) || {}),
   ].filter((key, index, list) => list.indexOf(key) === index);
   for (const key of keys) {
      if (typeof key === 'string' && omit.includes(key)) continue;
      const value = (target as Record<string | symbol, unknown>)[key];
      result[key] =
         typeof value === 'function'
            ? (...args: unknown[]) =>
                 (value as (...a: unknown[]) => unknown).apply(target, args)
            : value;
   }
   return result;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForNetworkIdle = async (
   page: Page,
   options: { timeout?: number } = {},
): Promise<boolean> => {
   const timeout = options.timeout ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
   if (
      !Number.isInteger(timeout) ||
      timeout <= 0 ||
      timeout > MAX_NETWORK_IDLE_TIMEOUT_MS
   ) {
      throw new Error(
         `page.waitForNetworkIdle 参数无效：timeout 必须是 1~${MAX_NETWORK_IDLE_TIMEOUT_MS} 的整数`,
      );
   }
   const inflight = new Set<unknown>();
   const track = (request: unknown) => void inflight.add(request);
   const settle = (request: unknown) => void inflight.delete(request);
   page.on('request', track);
   page.on('requestfinished', settle);
   page.on('requestfailed', settle);
   const deadline = Date.now() + timeout;
   let quietSince: number | null = null;
   try {
      while (Date.now() < deadline) {
         if (inflight.size > 0) quietSince = null;
         else {
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

export const exposePage = (page: Page) =>
   Object.assign(buildProxy(page, ['goto']), {
      waitForNetworkIdle: (options?: { timeout?: number }) =>
         waitForNetworkIdle(page, options),
   });

export interface HttpResult {
   status: number;
   headers: Record<string, string>;
   text: string;
   buffer: Buffer;
   json: unknown;
}

interface HttpRequestOptions {
   headers?: Record<string, string>;
   timeoutMs?: number;
}

/** 后端判题机的受限 HTTP 客户端：同源、单请求 10s、响应体 2MB。 */
export class LocalHttpClient {
   constructor(
      private readonly baseUrl: string,
      private readonly timeoutMs = 10_000,
      private readonly maxBytes = 2 * 1024 * 1024,
   ) {}

   private resolveUrl(path: string): string {
      const base = new URL(this.baseUrl);
      const normalizedBase = base.toString().endsWith('/')
         ? base.toString()
         : `${base.toString()}/`;
      const target = /^https?:\/\//i.test(path)
         ? new URL(path)
         : new URL(path.replace(/^\/+/, ''), normalizedBase);
      if (target.origin !== base.origin) {
         throw new Error(
            `判题脚本只能请求本服务（${base.origin}），拒绝了越界请求：${target.origin}`,
         );
      }
      return target.toString();
   }

   private async request(
      method: string,
      path: string,
      body?: unknown,
      options: HttpRequestOptions = {},
   ): Promise<HttpResult> {
      const url = this.resolveUrl(path);
      const timeoutMs = options.timeoutMs ?? this.timeoutMs;
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      let payload: string | undefined;
      if (body !== undefined && body !== null) {
         if (typeof body === 'string' || Buffer.isBuffer(body)) {
            payload = body.toString();
         } else {
            payload = JSON.stringify(body);
            if (
               !Object.keys(headers).some(
                  (key) => key.toLowerCase() === 'content-type',
               )
            ) {
               headers['content-type'] = 'application/json';
            }
         }
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
         response = await fetch(url, {
            method,
            headers,
            body: payload,
            signal: controller.signal,
         });
      } catch (error) {
         if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`请求超时（${timeoutMs}ms）：${method} ${url}`);
         }
         throw new Error(
            `请求失败：${method} ${url} —— ${error instanceof Error ? error.message : String(error)}`,
         );
      } finally {
         clearTimeout(timer);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > this.maxBytes) {
         throw new Error(
            `响应体过大（${buffer.length} > ${this.maxBytes} 字节）：${method} ${url}`,
         );
      }
      const text = buffer.toString('utf8');
      let json: unknown;
      if ((response.headers.get('content-type') ?? '').includes('json')) {
         try {
            json = JSON.parse(text);
         } catch {
            json = undefined;
         }
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
         responseHeaders[key] = value;
      });
      return {
         status: response.status,
         headers: responseHeaders,
         text,
         buffer,
         json,
      };
   }

   get(path: string, options?: HttpRequestOptions) {
      return this.request('GET', path, undefined, options);
   }
   post(path: string, body?: unknown, options?: HttpRequestOptions) {
      return this.request('POST', path, body, options);
   }
   put(path: string, body?: unknown, options?: HttpRequestOptions) {
      return this.request('PUT', path, body, options);
   }
   patch(path: string, body?: unknown, options?: HttpRequestOptions) {
      return this.request('PATCH', path, body, options);
   }
   delete(path: string, body?: unknown, options?: HttpRequestOptions) {
      return this.request('DELETE', path, body, options);
   }
}

export type JudgeTarget =
   | { kind: 'frontend'; page: Page }
   | { kind: 'backend'; http: LocalHttpClient };

/** 在与线上同构的沙箱里执行判题脚本：vm 上下文只注入线上也有的全局（没有 setTimeout / fetch / URL）。 */
export const runJudgeScript = async (
   code: string,
   target: JudgeTarget,
   log: (message: string) => void = () => {},
): Promise<ScriptResult> => {
   const system = new LocalSystem();
   const defineTestHandler =
      (handler: (ctx: Record<string, unknown>) => Promise<void>) =>
      async (subject: unknown) => {
         await handler(
            target.kind === 'frontend'
               ? { page: subject, $: exposeFrontendSystem(system) }
               : { http: subject, $: exposeBackendSystem(system) },
         );
         const checkPoints = system.checkPoints;
         system.checkPoints = [];
         const results: CheckPointResult[] = [];
         for (const checkPoint of checkPoints) {
            let score = 0;
            const startedAt = Date.now();
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
                  name: checkPoint.name,
                  score,
                  totalScore: checkPoint.totalScore,
                  status: score >= checkPoint.passScore ? 'pass' : 'fail',
                  details:
                     successScore === undefined || successScore === null
                        ? `没有 return 分数，按 score 累计记 ${score} 分`
                        : `得分 ${score}`,
                  durationMs: Date.now() - startedAt,
               });
            } catch (error) {
               results.push({
                  name: checkPoint.name,
                  score,
                  totalScore: checkPoint.totalScore,
                  status: 'fail',
                  details: `失败，原因是：${error instanceof Error ? error.message : String(error)}`,
                  durationMs: Date.now() - startedAt,
               });
            }
         }
         return results;
      };

   const subject =
      target.kind === 'frontend' ? exposePage(target.page) : target.http;
   const sandboxConsole = Object.fromEntries(
      ['log', 'info', 'warn', 'error', 'debug'].map((level) => [
         level,
         (...args: unknown[]) =>
            log(`[judge.js console.${level}] ${args.map(String).join(' ')}`),
      ]),
   );
   const context = createContext({
      defineTestHandler,
      subject,
      console: sandboxConsole,
      Buffer,
   });

   let timer: NodeJS.Timeout | undefined;
   const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(
         () =>
            reject(
               new Error(
                  `判题脚本执行超过 ${SCRIPT_BUDGET_MS / 1000}s 未完成（线上会让所有检查点作废）`,
               ),
            ),
         SCRIPT_BUDGET_MS,
      );
   });
   try {
      const results = (await Promise.race([
         runInContext(
            `${replaceDefaultExport(code)}\n;run(subject);`,
            context,
            {
               filename: 'judge.js',
               timeout: 10_000,
            },
         ) as Promise<CheckPointResult[]>,
         guard,
      ])) as CheckPointResult[];
      return {
         results,
         score: results.reduce((sum, item) => sum + item.score, 0),
      };
   } finally {
      if (timer) clearTimeout(timer);
   }
};
