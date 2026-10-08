import type { Context, MiddlewareHandler } from 'hono';
import { CF_HEADER, verifyCloudFunctionSignature } from '@challenge/shared/cloud-function';
import type { ZodType } from 'zod';
import { config, type Scope } from '../config';
import { resolveKey } from '../services/keys';
import { getRedis } from '../services/redis';
import { fail } from '../utils/errors';
import { createTraceId } from '../utils/ids';
import type { Caller } from '../types';

/** 为每个请求生成/透传 traceId（在验签之前，保证报错也能带上）。 */
export const traceMiddleware: MiddlewareHandler = async (c, next) => {
   const incoming = c.req.header('x-trace-id');
   c.set('traceId', incoming && incoming.length > 0 ? incoming : createTraceId());
   await next();
};

export const signatureMiddleware: MiddlewareHandler = async (c, next) => {
   const keyId = c.req.header(CF_HEADER.keyId);
   const timestamp = c.req.header(CF_HEADER.timestamp);
   const nonce = c.req.header(CF_HEADER.nonce);
   const signature = c.req.header(CF_HEADER.signature);
   const userIdHeader = c.req.header(CF_HEADER.userId) ?? null;

   if (!keyId || !timestamp || !nonce || !signature) {
      fail('UNAUTHORIZED', '缺少签名请求头');
   }

   const timestampNumber = Number(timestamp);
   if (
      !Number.isFinite(timestampNumber) ||
      Math.abs(Date.now() - timestampNumber) > config.signWindowMs
   ) {
      fail('UNAUTHORIZED', '签名时间戳超出允许窗口');
   }

   const resolved = await resolveKey(keyId);
   if (!resolved) {
      fail('UNAUTHORIZED', '未知或已失效的 API Key');
   }

   // 只有内部调用方可以代表某个用户；外部 key 的 userId 头一律忽略。
   const userId = resolved.type === 'internal' ? userIdHeader : null;

   // 读取请求体一次，之后控制器复用（避免 Hono 二次读流）。
   const rawBody = await c.req.text();

   const url = new URL(c.req.url);
   const query: Record<string, string> = {};
   url.searchParams.forEach((value, key) => {
      query[key] = value;
   });

   const verified = verifyCloudFunctionSignature({
      method: c.req.method,
      path: url.pathname,
      query,
      body: rawBody,
      timestamp,
      nonce,
      userId,
      secret: resolved.secret,
      signature,
   });

   if (!verified) {
      fail('UNAUTHORIZED', '签名校验失败');
   }

   // 防重放：同一 (keyId, nonce) 在时间窗内只能出现一次。
   const nonceKey = `cf:nonce:${keyId}:${nonce}`;
   const stored = await getRedis().set(
      nonceKey,
      '1',
      'PX',
      config.signWindowMs,
      'NX',
   );
   if (stored !== 'OK') {
      fail('REPLAY_DETECTED', '请求已被处理过（nonce 重复）');
   }

   const caller: Caller = {
      keyId,
      type: resolved.type,
      scopes: resolved.scopes,
      allowedFunctions: resolved.allowedFunctions,
      restricted: resolved.restricted,
      userId,
   };

   c.set('caller', caller);
   c.set('rawBody', rawBody);
   await next();
};

/** 路由级 scope 校验。 */
export const requireScope = (scope: Scope): MiddlewareHandler => {
   return async (c, next) => {
      const caller = c.get('caller');
      if (!caller || !caller.scopes.includes(scope)) {
         fail('FORBIDDEN', `该 API Key 缺少 ${scope} 权限`);
      }
      await next();
   };
};

/** 校验调用方是否有权调用某个函数（判题白名单 / key 的 allowedFunctions）。 */
export const assertFunctionAllowed = (
   caller: Caller,
   name: string,
): void => {
   if (caller.restricted && !caller.allowedFunctions.includes(name)) {
      fail('FORBIDDEN', `调用方无权调用函数「${name}」`);
   }
};

export const parseBody = <T>(c: Context, schema: ZodType<T>): T => {
   const raw = c.get('rawBody') ?? '';
   let json: unknown;
   try {
      json = raw.length > 0 ? JSON.parse(raw) : {};
   } catch {
      return fail('INVALID_INPUT', '请求体不是合法 JSON');
   }

   const result = schema.safeParse(json);
   if (!result.success) {
      const message = result.error.issues
         .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
         .join('；');
      return fail('INVALID_INPUT', `请求参数不合法：${message}`);
   }
   return result.data;
};
