import dotenv from 'dotenv';

// 在读取任何 process.env 之前加载 .env（开发环境）。
// 生产环境由 compose 注入，dotenv 找不到文件也不会报错。
dotenv.config();

export type Scope = 'invoke' | 'read' | 'manage';

const str = (key: string, fallback = ''): string => process.env[key] ?? fallback;

const int = (key: string, fallback: number): number => {
   const raw = process.env[key];
   if (!raw) return fallback;
   const parsed = Number.parseInt(raw, 10);
   return Number.isFinite(parsed) ? parsed : fallback;
};

const parseJson = <T>(key: string, fallback: T): T => {
   const raw = process.env[key];
   if (!raw) return fallback;
   try {
      return JSON.parse(raw) as T;
   } catch {
      throw new Error(
         `[配置错误] 环境变量 ${key} 不是合法 JSON。期望例如 {"k":"v"}，实际收到：${raw.slice(0, 40)}…`,
      );
   }
};

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 开发环境的兜底凭据。
 *
 * 与 web-app 的 `dev_only_*` 思路一致：开发环境开箱可用；生产环境缺失时**启动即失败**，
 * 绝不静默降级——否则任何人都能拿源码里的默认密钥伪造调用。
 */
const DEV_INTERNAL_KEYS: Record<string, string> = {
   'web-app': 'dev_only_cloud_function_web_app',
   judge: 'dev_only_cloud_function_judge',
};
const DEV_MASTER_SECRETS: Record<string, string> = {
   '1': 'dev_only_cloud_function_master',
};

/** 内部密钥默认 scope。可用 CF_INTERNAL_KEY_SCOPES 覆盖。 */
const DEFAULT_INTERNAL_KEY_SCOPES: Record<string, Scope[]> = {
   'web-app': ['invoke', 'read', 'manage'],
   judge: ['invoke'],
};

const internalKeys = parseJson<Record<string, string>>(
   'CF_INTERNAL_KEYS',
   isProduction ? {} : DEV_INTERNAL_KEYS,
);

const masterSecrets = parseJson<Record<string, string>>(
   'CF_MASTER_SECRETS',
   isProduction ? {} : DEV_MASTER_SECRETS,
);

if (isProduction) {
   const missing: string[] = [];
   if (Object.keys(internalKeys).length === 0) missing.push('CF_INTERNAL_KEYS');
   if (Object.keys(masterSecrets).length === 0) missing.push('CF_MASTER_SECRETS');
   if (missing.length > 0) {
      throw new Error(
         `[配置错误] 缺少 ${missing.join(' / ')}。` +
            '内部密钥缺失会让站点/判题无法自动认证；主密钥缺失会让外部 API Key 无法签发与校验。' +
            '生产环境拒绝以空密钥启动。',
      );
   }
}

export interface CloudFunctionConfig {
   nodeEnv: string;
   isProduction: boolean;
   port: number;
   redis: {
      host: string;
      port: number;
      username: string;
      password: string;
      db: number;
   };
   /** 签名时间窗（毫秒）。 */
   signWindowMs: number;
   internalKeys: Record<string, string>;
   internalKeyScopes: Record<string, Scope[]>;
   masterSecrets: Record<string, string>;
   /** 判题环境可调用的函数白名单；空数组 = 不允许判题调用任何函数。 */
   judgeAllowedFunctions: string[];
   worker: {
      poolSize: number;
      memoryMb: number;
      recycleAfter: number;
      queueMax: number;
      maxConcurrencyPerFunction: number;
      maxTimeoutMs: number;
      maxResponseBytes: number;
   };
   kv: {
      maxKeyLength: number;
      maxValueBytes: number;
      maxTtlSeconds: number;
      defaultTtlSeconds: number;
      maxKeysPerScope: number;
      maxBytesPerScope: number;
      scanLimit: number;
      maxOpsPerInvoke: number;
      ratePerSecond: number;
   };
   invocationRetentionDays: number;
}

const workerPoolSize = int('CF_WORKER_POOL_SIZE', Math.min(4, 4));

export const config: CloudFunctionConfig = {
   nodeEnv: str('NODE_ENV', 'development'),
   isProduction,
   port: int('PORT', 1890),
   redis: {
      host: str('REDIS_HOST', 'localhost'),
      port: int('REDIS_PORT', 6379),
      username: str('REDIS_USERNAME', ''),
      password: str('REDIS_PASSWORD', ''),
      db: int('CF_REDIS_DB', int('REDIS_DB', 0)),
   },
   signWindowMs: int('CF_SIGN_WINDOW_MS', 5 * 60 * 1000),
   internalKeys,
   internalKeyScopes: parseJson<Record<string, Scope[]>>(
      'CF_INTERNAL_KEY_SCOPES',
      DEFAULT_INTERNAL_KEY_SCOPES,
   ),
   masterSecrets,
   judgeAllowedFunctions: str('CF_JUDGE_ALLOWED_FUNCTIONS', '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
   worker: {
      poolSize: workerPoolSize,
      memoryMb: int('CF_WORKER_MEMORY_MB', 128),
      recycleAfter: int('CF_WORKER_RECYCLE', 200),
      queueMax: int('CF_QUEUE_MAX', 256),
      maxConcurrencyPerFunction: int('CF_MAX_CONCURRENCY_PER_FUNCTION', 16),
      maxTimeoutMs: int('CF_MAX_TIMEOUT_MS', 30_000),
      maxResponseBytes: int('CF_MAX_RESPONSE_BYTES', 256 * 1024),
   },
   kv: {
      maxKeyLength: int('CF_KV_MAX_KEY_LEN', 256),
      maxValueBytes: int('CF_KV_MAX_VALUE_BYTES', 64 * 1024),
      maxTtlSeconds: int('CF_KV_MAX_TTL_SECONDS', 7 * 24 * 3600),
      defaultTtlSeconds: int('CF_KV_DEFAULT_TTL', 24 * 3600),
      maxKeysPerScope: int('CF_KV_MAX_KEYS_PER_SCOPE', 1000),
      maxBytesPerScope: int('CF_KV_MAX_BYTES_PER_SCOPE', 4 * 1024 * 1024),
      scanLimit: int('CF_KV_SCAN_LIMIT', 100),
      maxOpsPerInvoke: int('CF_KV_MAX_OPS_PER_INVOKE', 200),
      ratePerSecond: int('CF_KV_RATE_PER_SEC', 100),
   },
   invocationRetentionDays: int('CF_INVOCATION_RETENTION_DAYS', 14),
};
