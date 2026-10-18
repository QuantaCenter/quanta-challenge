/** 后端服务题型的判题脚本运行时：与前端判题机的 system.ts 平行实现，这里暴露受约束的 http 客户端，共用「检查点 => 结果」聚合约定。 */

export interface HttpResult {
   status: number;
   headers: Record<string, string>;
   /** 原始文本（utf8 解码）。二进制响应也能拿到，但更推荐用 buffer。 */
   text: string;
   /** 原始字节，适合图片 / 二进制协议。 */
   buffer: Buffer;
   /** content-type 为 JSON 且解析成功时才存在，否则为 undefined。 */
   json: any;
}

export interface HttpRequestOptions {
   headers?: Record<string, string>;
   /** 单请求超时（毫秒）。默认 10s。 */
   timeoutMs?: number;
}

export interface HttpClientConfig {
   /** 允许访问的基准地址；脚本只能请求与它同源的地址（防 SSRF）。 */
   baseUrl: string;
   timeoutMs: number;
   maxBytes: number;
}

/** 受限 HTTP 客户端，安全边界：同源白名单（防 SSRF）、单请求 10s 超时、响应体 2MB 上限。 */
export class HttpClient {
   constructor(private readonly config: HttpClientConfig) {}

   private resolveUrl(path: string): string {
      const base = new URL(this.config.baseUrl);
      let target: URL;
      if (/^https?:\/\//i.test(path)) {
         target = new URL(path);
      } else {
         // 以 baseUrl 为根解析相对路径：确保 baseUrl 末尾有 '/'，且去掉 path 前导 '/'
         const normalizedBase = base.toString().endsWith('/')
            ? base.toString()
            : `${base.toString()}/`;
         target = new URL(path.replace(/^\/+/, ''), normalizedBase);
      }

      if (target.origin !== base.origin) {
         throw new Error(
            `判题脚本只能请求本服务（${base.origin}），拒绝了越界请求：${target.origin}`
         );
      }
      return target.toString();
   }

   private async request(
      method: string,
      path: string,
      body?: unknown,
      options: HttpRequestOptions = {}
   ): Promise<HttpResult> {
      const url = this.resolveUrl(path);
      const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;

      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      let payload: string | undefined;
      if (body !== undefined && body !== null) {
         if (typeof body === 'string' || Buffer.isBuffer(body)) {
            payload = body.toString();
         } else {
            payload = JSON.stringify(body);
            if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
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
      } catch (error: any) {
         if (error?.name === 'AbortError') {
            throw new Error(`请求超时（${timeoutMs}ms）：${method} ${url}`);
         }
         throw new Error(`请求失败：${method} ${url} —— ${error?.message ?? error}`);
      } finally {
         clearTimeout(timer);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > this.config.maxBytes) {
         throw new Error(
            `响应体过大（${buffer.length} > ${this.config.maxBytes} 字节）：${method} ${url}`
         );
      }

      const text = buffer.toString('utf8');
      const contentType = response.headers.get('content-type') ?? '';
      let json: any;
      if (contentType.includes('json')) {
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

      return { status: response.status, headers: responseHeaders, text, buffer, json };
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

interface IDefineCheckPointCtx {
   score: {
      increment: (increment: number) => void;
      set: (value: number) => void;
      get: () => number;
   };
}

const generateUUID = () => crypto.randomUUID();

export class System {
   _checkPoints: Array<{
      name: string;
      totalScore: number;
      passScore: number;
      handler: (
         ctx: IDefineCheckPointCtx
      ) => Promise<number | void> | number | void;
   }> = [];

   /** 判题过程中脚本主动保存的附带文件（落库为 shadow files）。 */
   files: Record<string, Buffer> = {};

   getAndCleanupFiles() {
      const files = this.files;
      this.files = {};
      return files;
   }

   constructor(
      public readonly mode: 'audit' | 'judge',
      public readonly info: Record<string, string> = {}
   ) {}

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

   /** 把一段文本/二进制作为附件保存，便于在判题详情里排查问题。 */
   save(content: string | Buffer, name?: string) {
      const buffer = Buffer.isBuffer(content)
         ? content
         : Buffer.from(String(content), 'utf8');
      const fileName =
         name ?? `${generateUUID()}${buffer.length ? '.txt' : '.txt'}`;
      this.files[fileName] = buffer;
      return 1;
   }

   async score(totalScore: number, rating: () => number) {
      const rate = rating();
      const score = Math.max(0, Math.min(rate, 1)) * totalScore;
      return score;
   }
}

const getExposeSystem = (sys: System) => {
   return {
      save: sys.save.bind(sys),
      score: sys.score.bind(sys),
      defineCheckPoint: sys.defineCheckPoint.bind(sys),
      expect: sys.expect.bind(sys),
   };
};

interface IHandlerCtx {
   http: HttpClient;
   $: ReturnType<typeof getExposeSystem>;
}

interface ITestResult {
   score: number;
   totalScore: number;
   details: string;
   status: 'pass' | 'fail';
   cacheFiles: Record<string, Buffer>;
}

export const defineTestHandler = (
   handler: (ctx: IHandlerCtx) => Promise<void>
) => {
   return async (http: HttpClient, system: System) => {
      await handler({
         http,
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
