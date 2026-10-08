import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * 云函数调用签名。
 *
 * 与 `service/openapi/sign.ts` 的关系：那套是 `sha256(path?params+timestamp+secret)` 的
 * 简化版，用于已上线的判题 webhook，**不要改动**。本模块是它的超集，额外覆盖了：
 *   · HTTP 方法（避免 GET/POST 混用同一签名）
 *   · 请求体哈希（避免只改 body 就能复用签名）
 *   · nonce（配合服务端 SET NX 防重放）
 *   · 调用者用户身份（避免中间人伪造 `x-cf-user-id`）
 *
 * 服务端与客户端共用同一份实现，保证规范化串不会两边写歪。
 */

export const CF_HEADER = {
   keyId: 'x-cf-key-id',
   timestamp: 'x-cf-timestamp',
   nonce: 'x-cf-nonce',
   signature: 'x-cf-signature',
   userId: 'x-cf-user-id',
} as const;

/** query 仅支持单值；数组会被忽略（本 API 不使用数组 query）。 */
export type CloudFunctionQuery = Record<
   string,
   string | number | boolean | undefined | null
>;

const sha256Hex = (data: string | Uint8Array) =>
   createHash('sha256').update(data).digest('hex');

/**
 * 规范化 query。
 *
 * 只保留有值的键，按 key 字典序排序后拼成 `k=v&k2=v2`。
 * 必须与客户端完全一致，否则同一请求在两端算出不同签名。
 */
export const canonicalizeQuery = (query?: CloudFunctionQuery): string => {
   if (!query) return '';
   return Object.keys(query)
      .filter((key) => {
         const value = query[key];
         return value !== undefined && value !== null && value !== '';
      })
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('&');
};

export interface BuildCanonicalStringOptions {
   method: string;
   /** 不含 query 的路径，例如 `/v1/invoke/daily-bonus`。 */
   path: string;
   query?: CloudFunctionQuery;
   body?: string | Uint8Array | null;
   timestamp: string | number;
   nonce: string;
   /** 调用代表的用户 id；参与签名。无则视为空串。 */
   userId?: string | null;
}

/**
 * 规范化串（7 行，`\n` 分隔）：
 *   METHOD
 *   PATH
 *   SORTED_QUERY
 *   SHA256_HEX(BODY)  // 无 body 时为空串
 *   TIMESTAMP
 *   NONCE
 *   USER_ID
 */
export const buildCanonicalString = (
   options: BuildCanonicalStringOptions,
): string => {
   const bodyHash =
      options.body === undefined || options.body === null || options.body === ''
         ? ''
         : sha256Hex(options.body);

   return [
      options.method.toUpperCase(),
      options.path,
      canonicalizeQuery(options.query),
      bodyHash,
      String(options.timestamp),
      options.nonce,
      options.userId ?? '',
   ].join('\n');
};

export interface SignCloudFunctionRequestOptions
   extends BuildCanonicalStringOptions {
   secret: string;
}

export const signCloudFunctionRequest = (
   options: SignCloudFunctionRequestOptions,
): string => {
   return createHmac('sha256', options.secret)
      .update(buildCanonicalString(options))
      .digest('hex');
};

/**
 * 定时安全比较两个**等长**十六进制串。
 *
 * 刻意不用 `crypto.timingSafeEqual`：它要求 `ArrayBufferView`，而不同 tsconfig（web-app 与
 * 独立服务）下 `Buffer` 的泛型参数会与 lib 的 `Uint8Array` 定义对不上，导致
 * "Buffer<ArrayBuffer> is not assignable to Uint8Array<ArrayBufferLike>" 这类纯类型噪音。
 * 这里直接对字符做等长 XOR 累加：长度本身不是秘密，只要不提前 short-circuit 就满足定时安全。
 */
export const timingSafeEqualHex = (a: string, b: string): boolean => {
   if (typeof a !== 'string' || typeof b !== 'string') return false;
   if (a.length === 0 || a.length !== b.length) return false;
   if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;

   let diff = 0;
   for (let index = 0; index < a.length; index += 1) {
      diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
   }
   return diff === 0;
};

export interface VerifyCloudFunctionSignatureOptions
   extends SignCloudFunctionRequestOptions {
   signature: string;
}

export const verifyCloudFunctionSignature = (
   options: VerifyCloudFunctionSignatureOptions,
): boolean => {
   const expected = signCloudFunctionRequest(options);
   return timingSafeEqualHex(expected, options.signature);
};

/** 生成一次性的 nonce（16 字节 → base64url）。 */
export const createNonce = (): string => randomBytes(16).toString('base64url');

export interface GenerateCloudFunctionHeadersOptions
   extends Omit<BuildCanonicalStringOptions, 'timestamp' | 'nonce'> {
   keyId: string;
   secret: string;
   timestamp?: number;
   nonce?: string;
}

/**
 * 组装签名请求头（客户端用）。
 *
 * 时间戳与 nonce 未显式传入时自动生成；返回的 headers 可直接喂给 fetch。
 */
export const generateCloudFunctionHeaders = (
   options: GenerateCloudFunctionHeadersOptions,
): Record<string, string> => {
   const timestamp = options.timestamp ?? Date.now();
   const nonce = options.nonce ?? createNonce();

   const signature = signCloudFunctionRequest({
      method: options.method,
      path: options.path,
      query: options.query,
      body: options.body,
      timestamp,
      nonce,
      userId: options.userId,
      secret: options.secret,
   });

   const headers: Record<string, string> = {
      [CF_HEADER.keyId]: options.keyId,
      [CF_HEADER.timestamp]: String(timestamp),
      [CF_HEADER.nonce]: nonce,
      [CF_HEADER.signature]: signature,
      'content-type': 'application/json',
   };

   if (options.userId) {
      headers[CF_HEADER.userId] = options.userId;
   }

   return headers;
};
