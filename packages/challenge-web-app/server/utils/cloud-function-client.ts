import { generateCloudFunctionHeaders } from '@challenge/shared/cloud-function';
import { TRPCError } from '@trpc/server';
import { logger } from '~~/lib/logger';

export class CloudFunctionClientError extends Error {
   constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
   ) {
      super(message);
      this.name = 'CloudFunctionClientError';
   }
}

/** 把云函数服务的错误映射成 tRPC 错误，便于前端统一处理。 */
export const rethrowAsTRPCError = (error: unknown): never => {
   if (error instanceof CloudFunctionClientError) {
      const code =
         error.status === 404
            ? 'NOT_FOUND'
            : error.status === 403
              ? 'FORBIDDEN'
              : error.status === 429
                ? 'TOO_MANY_REQUESTS'
                : error.status === 401
                  ? 'UNAUTHORIZED'
                  : error.status >= 500
                    ? 'INTERNAL_SERVER_ERROR'
                    : 'BAD_REQUEST';
      throw new TRPCError({ code, message: error.message });
   }
   throw error;
};

/**
 * 云函数服务返回的数据形状。
 *
 * 定义在这里是为了让 `admin.cloudFunction.*` 的 tRPC 过程携带具体返回类型，
 * 前端页面（`app/pages/app/{publish,manage}/cloud-function`）因此能获得完整类型推导。
 * 时间字段在 HTTP/JSON 层是 ISO 字符串。
 */
export interface CloudFunctionRecord {
   id: string;
   name: string;
   description: string;
   enabled: boolean;
   kvUserIsolated: boolean;
   timeoutMs: number;
   maxResponseBytes: number;
   activeVersionId: string | null;
   createdBy: string;
   createdAt: string;
   updatedAt: string;
   activeVersion: {
      id: string;
      version: number;
      sourceHash?: string;
      createdAt: string;
   } | null;
   _count?: { versions: number };
}

export interface CloudFunctionVersionRecord {
   id: string;
   version: number;
   source?: string;
   sourceHash: string;
   createdBy: string;
   createdAt: string;
}

export interface PublishVersionResult {
   name: string;
   version: number;
   versionId: string;
   activated: boolean;
   reused: boolean;
   compiledBytes: number;
}

export interface CloudFunctionApiKeyRecord {
   keyId: string;
   name: string;
   scopes: string[];
   allowedFunctions: string[];
   enabled?: boolean;
   expiresAt: string | null;
   lastUsedAt?: string | null;
   createdBy: string;
   createdAt: string;
   cloudFunctionId?: string | null;
}

/** 仅在签发时出现一次：`secret` 之后无法再次获取。 */
export interface CreatedCloudFunctionApiKey
   extends CloudFunctionApiKeyRecord {
   secret: string;
}

interface CallCloudFunctionServiceOptions {
   method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
   /** 不含 query 的路径，例如 `/v1/invoke/daily-bonus`。 */
   path: string;
   query?: Record<string, string>;
   body?: unknown;
   /** 调用代表的用户；由服务端会话解析，绝不来自前端。 */
   userId?: string | null;
   traceId?: string | null;
}

/**
 * 带签名的云函数服务客户端。
 *
 * 内部密钥来自 runtimeConfig（部署环境注入），因此站点对云函数服务是**自动认证**的
 * ——无需管理员在后台签发任何 key。浏览器永远拿不到这个 secret。
 */
export const callCloudFunctionService = async <T>(
   options: CallCloudFunctionServiceOptions,
): Promise<T> => {
   const { cloudFunction } = useRuntimeConfig();
   const serverUrl = cloudFunction.serverUrl;
   const keyId = cloudFunction.keyId;
   const secret = cloudFunction.secret;

   if (!secret) {
      throw new CloudFunctionClientError(
         'INTERNAL_ERROR',
         '[配置错误] CF_INTERNAL_SECRET 未配置，无法调用云函数服务',
         500,
      );
   }

   const bodyString =
      options.body === undefined ? '' : JSON.stringify(options.body);

   const headers = generateCloudFunctionHeaders({
      method: options.method,
      path: options.path,
      query: options.query,
      body: bodyString,
      keyId,
      secret,
      userId: options.userId ?? undefined,
   });

   if (options.traceId) headers['x-trace-id'] = options.traceId;

   const url = new URL(options.path, serverUrl);
   for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
   }

   let response: Response;
   try {
      response = await fetch(url, {
         method: options.method,
         headers,
         body: bodyString.length > 0 ? bodyString : undefined,
      });
   } catch (error) {
      logger.error({ error, path: options.path }, '云函数服务不可达');
      throw new CloudFunctionClientError(
         'INTERNAL_ERROR',
         '云函数服务不可达',
         502,
      );
   }

   const text = await response.text();
   let json: { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } } | null =
      null;
   try {
      json = text ? JSON.parse(text) : null;
   } catch {
      json = null;
   }

   if (!response.ok || !json?.ok) {
      const code = json?.error?.code ?? `HTTP_${response.status}`;
      const message = json?.error?.message ?? '云函数服务调用失败';
      throw new CloudFunctionClientError(code, message, response.status);
   }

   return json.data as T;
};
