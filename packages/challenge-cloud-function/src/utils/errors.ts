/**
 * 统一错误类型与错误码。
 *
 * 控制器的 onError 会把它映射成 `{ ok:false, error:{ code, message, traceId } }`，
 * 并选用对应的 HTTP 状态码。所有"可预期"的失败都应走这里，而不是抛裸 Error。
 */
export type CloudFunctionErrorCode =
   | 'UNAUTHORIZED'
   | 'FORBIDDEN'
   | 'REPLAY_DETECTED'
   | 'FUNCTION_NOT_FOUND'
   | 'FUNCTION_DISABLED'
   | 'FUNCTION_NOT_PUBLISHED'
   | 'INVALID_INPUT'
   | 'COMPILE_ERROR'
   | 'TIMEOUT'
   | 'OOM'
   | 'RUNTIME_ERROR'
   | 'KV_QUOTA_EXCEEDED'
   | 'FUNCTION_BUSY'
   | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<CloudFunctionErrorCode, number> = {
   UNAUTHORIZED: 401,
   FORBIDDEN: 403,
   REPLAY_DETECTED: 409,
   FUNCTION_NOT_FOUND: 404,
   FUNCTION_DISABLED: 409,
   FUNCTION_NOT_PUBLISHED: 409,
   INVALID_INPUT: 400,
   COMPILE_ERROR: 400,
   TIMEOUT: 504,
   OOM: 500,
   RUNTIME_ERROR: 500,
   KV_QUOTA_EXCEEDED: 429,
   FUNCTION_BUSY: 429,
   INTERNAL_ERROR: 500,
};

export class CloudFunctionError extends Error {
   readonly code: CloudFunctionErrorCode;
   readonly status: number;
   readonly details?: unknown;

   constructor(
      code: CloudFunctionErrorCode,
      message: string,
      details?: unknown,
   ) {
      super(message);
      this.name = 'CloudFunctionError';
      this.code = code;
      this.status = STATUS_BY_CODE[code] ?? 500;
      this.details = details;
   }
}

/**
 * 抛出一个云函数错误。
 *
 * 刻意用**函数声明**（而非 `const fail = () => ...`）：只有显式标注 `: never` 的函数声明
 * 才会被 TypeScript 的控制流分析识别为"永不返回"，从而在 `if (!x) fail(...)` 之后正确收窄 x。
 */
export function fail(
   code: CloudFunctionErrorCode,
   message: string,
   details?: unknown,
): never {
   throw new CloudFunctionError(code, message, details);
}

export const isCloudFunctionError = (
   error: unknown,
): error is CloudFunctionError => error instanceof CloudFunctionError;
