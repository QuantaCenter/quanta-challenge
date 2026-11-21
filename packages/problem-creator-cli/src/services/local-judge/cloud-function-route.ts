import type { BrowserContext, Request } from 'playwright-core';
import { PrecheckError } from '../../core/errors';
import { cloudFunctionSourceError } from '../../domain/cloud-function';
import type { ResolvedProblemConfig } from '../../domain/problem-config';
import { readText } from '../../utils/fs';
import { displayPath } from '../../utils/paths';
import { LocalCloudFunctionKv } from './cloud-function-kv';
import {
   CloudFunctionError,
   compileLocalCloudFunction,
   createLocalCloudFunction,
} from './cloud-function-runtime';

type LocalSource = Awaited<ReturnType<typeof compileLocalCloudFunction>>;
const MAX_RESPONSE_BYTES = 256 * 1024;

export const prepareLocalCloudFunction = async (
   config: ResolvedProblemConfig,
): Promise<LocalSource | undefined> => {
   const { cloudFunctionName: name, cloudFunctionSource: file } = config;
   if (!name || !file) return undefined;

   try {
      const source = await readText(file);
      const invalid = cloudFunctionSourceError(source);
      if (invalid) throw new CloudFunctionError('INVALID_INPUT', invalid);
      return await compileLocalCloudFunction(source, name);
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PrecheckError(
         `云函数「${name}」加载失败（${displayPath(config.rootDir, file)}）：${message}`,
         {
            cause: error,
            details: {
               file,
               code:
                  error instanceof CloudFunctionError ? error.code : undefined,
            },
         },
      );
   }
};

const readInput = (request: Request): unknown => {
   try {
      const body = request.postDataJSON() as { input?: unknown } | null;
      return body?.input ?? null;
   } catch {
      throw new CloudFunctionError('INVALID_INPUT', '请求体必须是合法的 JSON');
   }
};

export const attachLocalCloudFunction = async (
   context: BrowserContext,
   source: LocalSource,
   log: (message: string) => void,
) => {
   const { name } = source;
   const cloud = createLocalCloudFunction(source, {
      kv: new LocalCloudFunctionKv(),
      log,
   });
   // /api/cloud-function/token 签发令牌，名为 token 的函数只走显式调用路径。
   const path = name === 'token' ? 'invoke/token' : `(?:invoke/)?${name}`;
   await context.route(
      new RegExp(`^https?://[^/]+/api/cloud-function/${path}(?:\\?|$)`),
      async (route) => {
         const request = route.request();
         const requestHeaders = request.headers();
         const headers = {
            'access-control-allow-origin': requestHeaders.origin ?? '*',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'POST, OPTIONS',
            'cross-origin-resource-policy': 'cross-origin',
         };
         const replyError = (status: number, code: string, message: string) =>
            route.fulfill({
               status,
               headers,
               json: { ok: false, error: { code, message } },
            });

         if (request.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
         }
         if (request.method() !== 'POST') {
            await replyError(405, 'INVALID_INPUT', '只支持 POST');
            return;
         }
         if (!requestHeaders['content-type']?.includes('application/json')) {
            await replyError(
               415,
               'INVALID_INPUT',
               'Content-Type 必须是 application/json',
            );
            return;
         }

         let body: string;
         try {
            const result = await cloud.invoke(readInput(request));
            const data = JSON.stringify(result ?? null);
            if (Buffer.byteLength(data, 'utf8') > MAX_RESPONSE_BYTES) {
               throw new CloudFunctionError(
                  'RUNTIME_ERROR',
                  `返回体超过上限 ${MAX_RESPONSE_BYTES} 字节`,
               );
            }
            body = `{"ok":true,"data":${data}}`;
         } catch (error) {
            const failure =
               error instanceof CloudFunctionError
                  ? error
                  : new CloudFunctionError(
                       'RUNTIME_ERROR',
                       error instanceof Error ? error.message : String(error),
                    );
            log(`本地云函数「${name}」${failure.code}：${failure.message}`);
            await replyError(failure.status, failure.code, failure.message);
            return;
         }

         await route.fulfill({
            status: 200,
            headers,
            contentType: 'application/json',
            body,
         });
      },
   );
   return cloud;
};
