import { createHash, createHmac, randomBytes } from 'crypto';

/** 云函数调用签名：service/openapi/sign.ts（判题 webhook）的超集，额外覆盖 HTTP 方法、body 哈希、nonce 防重放与用户身份；服务端与客户端共用本实现。 */

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

/** 规范化 query：只保留有值的键，按 key 字典序拼成 `k=v&k2=v2`；两端必须一致，否则签名对不上。 */
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

/** 规范化串（7 行，`\n` 分隔）：METHOD、PATH、SORTED_QUERY、SHA256_HEX(BODY)、TIMESTAMP、NONCE、USER_ID。 */
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

/** 定时安全比较两个等长十六进制串；刻意用等长 XOR 累加而非 crypto.timingSafeEqual，规避不同 tsconfig 下 Buffer 泛型的类型噪音。 */
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

/** 组装签名请求头（客户端用）：时间戳与 nonce 未传时自动生成，返回的 headers 可直接喂给 fetch。 */
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
