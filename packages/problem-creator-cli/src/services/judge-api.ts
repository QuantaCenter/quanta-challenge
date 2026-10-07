import { CliError } from '../core/errors';
import type { FetchLike } from './http';

export interface JudgeApiOptions {
   baseUrl: string;
   fetch: FetchLike;
   timeoutMs?: number;
   signal?: AbortSignal;
}

/**
 * 判题调度器的公开接口。
 *
 * 只用到 `/code/extract`：它做的是"把 `export default ...` 替换成 `const run = ...`
 * 再转译 TS"这一步，正是判题机上真正执行的东西。
 * 本地先跑一遍能提前发现"脚本里没有 default export"这类会被服务端 400 掉的问题，
 * 而且不需要起判题机容器。
 */
export interface JudgeApi {
   extractJudgeScript(code: string): Promise<string>;
   ping(): Promise<boolean>;
}

export const createJudgeApi = (options: JudgeApiOptions): JudgeApi => {
   const baseUrl = options.baseUrl.replace(/\/+$/, '');
   const timeoutMs = options.timeoutMs ?? 5_000;

   const request = async (
      path: string,
      init: RequestInit = {},
   ): Promise<Response> => {
      const signal = options.signal
         ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
         : AbortSignal.timeout(timeoutMs);
      try {
         return await options.fetch(`${baseUrl}${path}`, { ...init, signal });
      } catch (error) {
         throw new CliError(`无法连接判题调度器：${baseUrl}${path}`, {
            cause: error,
            hint: '启动调度器（docker compose up -d）或省略 --judge 跳过这一步。',
         });
      }
   };

   return {
      extractJudgeScript: async (code) => {
         const response = await request('/code/extract', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code }),
         });
         if (!response.ok) {
            throw new CliError(
               `判题调度器拒绝了脚本（HTTP ${response.status}）`,
               {
                  details: { body: (await response.text()).slice(0, 500) },
               },
            );
         }
         const payload = (await response.json()) as { code?: string | null };
         if (!payload.code || typeof payload.code !== 'string') {
            throw new CliError('判题脚本无法提取 default export', {
               hint: '确认脚本写法是 `export default defineTestHandler(...)`。',
            });
         }
         return payload.code;
      },

      ping: async () => {
         try {
            const response = await request('/health', { method: 'GET' });
            return response.ok;
         } catch {
            return false;
         }
      },
   };
};
