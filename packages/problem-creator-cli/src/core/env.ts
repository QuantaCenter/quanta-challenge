import { resolveConfigDir } from '../services/credentials';

export const DEFAULT_API_URL = 'http://localhost:3000';
export const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
/** 5 MiB：与任务快照的实际体量匹配，超过基本意味着把构建产物打进去了 */
export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface EnvConfig {
   apiUrl: string;
   token: string | undefined;
   timeoutMs: number;
   maxUploadBytes: number;
   configDir: string;
}

const parsePositiveInt = (
   value: string | undefined,
   fallback: number,
): number => {
   if (!value) return fallback;
   const parsed = Number.parseInt(value, 10);
   return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** 环境变量是"默认值层"，命令行参数优先级更高（在 createCommandContext 里叠加） */
export const resolveEnvConfig = (
   env: NodeJS.ProcessEnv = process.env,
): EnvConfig => ({
   apiUrl: env.QUANTA_API_URL?.trim() || DEFAULT_API_URL,
   token: env.QUANTA_TOKEN?.trim() || undefined,
   timeoutMs: parsePositiveInt(
      env.QUANTA_HTTP_TIMEOUT,
      DEFAULT_HTTP_TIMEOUT_MS,
   ),
   maxUploadBytes: parsePositiveInt(
      env.QUANTA_MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
   ),
   configDir: resolveConfigDir(env),
});
