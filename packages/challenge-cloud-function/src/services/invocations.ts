import prisma from '../utils/prisma';
import { logger } from '../utils/logger';

export interface InvocationRecord {
   functionId: string;
   versionId: string;
   callerType: 'internal' | 'apiKey';
   callerKeyId: string;
   userId: string | null;
   status: 'success' | 'error' | 'timeout' | 'oom' | 'rejected';
   errorCode?: string | null;
   durationMs: number;
   inputBytes: number;
   outputBytes: number;
   traceId?: string | null;
}

/**
 * 异步写调用记录。
 *
 * 刻意不 await：审计日志写入失败不应影响调用结果。失败只记一条服务日志。
 */
export const recordInvocation = (record: InvocationRecord): void => {
   prisma.cloudFunctionInvocation
      .create({ data: record })
      .catch((error: unknown) =>
         logger.error(
            { error: error instanceof Error ? error.message : error },
            '写云函数调用记录失败',
         ),
      );
};

/** 把执行错误映射到调用记录里的 status。 */
export const statusFromErrorCode = (
   code: string | undefined,
): InvocationRecord['status'] => {
   switch (code) {
      case 'TIMEOUT':
         return 'timeout';
      case 'OOM':
         return 'oom';
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
      case 'REPLAY_DETECTED':
      case 'KV_QUOTA_EXCEEDED':
      case 'FUNCTION_BUSY':
         return 'rejected';
      default:
         return 'error';
   }
};
