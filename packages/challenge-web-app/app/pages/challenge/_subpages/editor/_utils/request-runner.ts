const REQUEST_RUNNER_DIR = '.quanta';

/** 容器内的请求脚本路径 */
export const REQUEST_RUNNER_SCRIPT_PATH = `${REQUEST_RUNNER_DIR}/request.mjs`;

/** 容器内的请求描述（JSON）路径 */
export const REQUEST_RUNNER_DESCRIPTOR_PATH = `${REQUEST_RUNNER_DIR}/request.json`;

export interface IRequestRunnerDescriptor {
   /** 容器内可直接访问的地址，例如 http://127.0.0.1:3000/health?a=1 */
   url: string;
   method: string;
   headers: Record<string, string>;
   /** 无请求体时为 null（GET/HEAD 带 body 会被 undici 直接拒绝） */
   body: string | null;
}

export interface IRequestRunnerSuccess {
   ok: true;
   status: number;
   statusText: string;
   url: string;
   headers: [name: string, value: string][];
   /** base64：响应体可能是二进制，用文本通道传会乱码 */
   bodyBase64: string;
   /** 脚本内部测得的耗时（含建连与读 body） */
   durationMs: number;
}

export interface IRequestRunnerFailure {
   ok: false;
   error: string;
   durationMs: number;
}

export type IRequestRunnerResult = IRequestRunnerSuccess | IRequestRunnerFailure;

/**
 * 脚本本身。
 *
 * 几点约束：
 * · 只输出**一行 JSON**（stdout 被面板解析成结果），因此不能有任何多余打印；
 * · 用 `node:fs/promises` + 顶层 await（容器里是 Node 24，`.mjs` 支持）；
 * · 失败也要输出 JSON —— 否则面板只能拿到空 stdout，用户看到的就是"没反应"。
 *
 * 注意：不要在这个字符串里使用模板插值（`${...}`），它是 String.raw 字面量。
 */
export const REQUEST_RUNNER_SCRIPT = String.raw`
import { readFile } from 'node:fs/promises';

const descriptorPath = process.argv[2];
const startedAt = Date.now();

const write = (payload) => {
   process.stdout.write(JSON.stringify(payload));
};

try {
   const descriptor = JSON.parse(await readFile(descriptorPath, 'utf-8'));

   const init = { method: descriptor.method, headers: descriptor.headers };
   if (descriptor.body !== null && descriptor.body !== undefined) {
      init.body = descriptor.body;
   }

   const response = await fetch(descriptor.url, init);
   const bytes = Buffer.from(await response.arrayBuffer());
   const headers = [];
   response.headers.forEach((value, name) => {
      headers.push([name, value]);
   });

   write({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      headers,
      bodyBase64: bytes.toString('base64'),
      durationMs: Date.now() - startedAt,
   });
} catch (error) {
   // undici 把真实原因包在 cause 里（例如 ECONNREFUSED）。
   // 只报 "fetch failed" 对使用者毫无帮助，所以把 cause 的 code 拼进去。
   const message = (error && error.message) || String(error);
   const cause =
      error && error.cause && (error.cause.code || error.cause.message);

   write({
      ok: false,
      error: cause ? message + ' (' + cause + ')' : message,
      durationMs: Date.now() - startedAt,
   });
}
`;
