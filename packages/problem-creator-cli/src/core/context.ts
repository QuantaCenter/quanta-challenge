import { resolve } from 'node:path';

import {
   type Credentials,
   credentialsPath,
   readCredentials,
   writeCredentials,
} from '../services/credentials';
import { HttpClient } from '../services/http';
import { type EnvConfig, resolveEnvConfig } from './env';
import { createLogger, type Logger, type LogLevel } from './logger';
import type { CliRuntime } from './runtime';

/** 全局参数（root command），子命令通过 optsWithGlobals() 取到 */
export interface GlobalOptions {
   api?: string;
   token?: string;
   cwd?: string;
   json?: boolean;
   quiet?: boolean;
   verbose?: boolean;
   color?: boolean;
   yes?: boolean;
}

export interface CommandContext {
   runtime: CliRuntime;
   logger: Logger;
   /** 相对路径的基准目录（--cwd > INIT_CWD > 进程 cwd） */
   cwd: string;
   env: EnvConfig;
   credentialsFile: string;
   credentials: Credentials;
   client: HttpClient;
   /** 交互确认开关：--yes 时跳过确认 */
   assumeYes: boolean;
   /** 凭据发生变化时落盘（登录、令牌刷新都会触发） */
   persistCredentials: (next?: Credentials) => Promise<void>;
}

const resolveLogLevel = (options: GlobalOptions): LogLevel => {
   if (options.verbose) return 'debug';
   if (options.quiet) return 'error';
   return 'info';
};

const resolveColor = (options: GlobalOptions, runtime: CliRuntime): boolean => {
   if (options.color !== undefined) return options.color;
   if (runtime.env.NO_COLOR) return false;
   return runtime.isTTY ?? false;
};

/**
 * 组装一次命令执行所需的全部上下文。
 *
 * 优先级：命令行参数 > 环境变量 > 凭据文件 > 内置默认值。
 * 反过来（凭据覆盖 --api）会出现"明明传了 --api 却连到旧地址"的经典事故。
 */
export const createCommandContext = async (
   options: GlobalOptions,
   runtime: CliRuntime,
): Promise<CommandContext> => {
   const env = resolveEnvConfig(runtime.env);
   const logger = createLogger({
      level: resolveLogLevel(options),
      json: options.json ?? false,
      color: resolveColor(options, runtime),
      stdout: runtime.stdout,
      stderr: runtime.stderr,
   });

   // 相对路径的基准目录：
   //   1. --cwd（显式指定，CI 用）
   //   2. INIT_CWD —— npm/pnpm 跑脚本时会把它设成"用户敲命令时所在的目录"，
   //      于是从仓库根执行 `pnpm qpc check my-problem` 时按仓库根解析，
   //      而不是按包目录（脚本 cwd）解析。
   //   3. 进程 cwd（直接 `node dist/index.js` 时）
   const baseDir = options.cwd ?? runtime.env.INIT_CWD ?? runtime.cwd;
   const cwd = resolve(runtime.cwd, baseDir);
   const credentialsFile = credentialsPath(env.configDir);
   const stored = await readCredentials(credentialsFile);

   const apiUrl = (options.api ?? stored.apiUrl ?? env.apiUrl).replace(
      /\/+$/,
      '',
   );
   const credentials: Credentials = {
      ...stored,
      apiUrl,
      cookies: { ...stored.cookies },
   };

   const tokenFromEnv = Boolean(options.token ?? env.token);
   if (tokenFromEnv) credentials.cookies.access = options.token ?? env.token;

   /**
    * 环境变量 / --token 提供的令牌**不落盘**：
    * 那是 CI 的临时凭据，写进磁盘等于把令牌留在构建机上。
    */
   const persistCredentials = async (next?: Credentials): Promise<void> => {
      if (tokenFromEnv && !next) return;
      await writeCredentials(credentialsFile, next ?? credentials);
   };

   const client = new HttpClient({
      baseUrl: apiUrl,
      fetch: runtime.fetch,
      cookies: credentials.cookies,
      logger,
      timeoutMs: env.timeoutMs,
      signal: runtime.signal,
      onCookiesChanged: (cookies) => {
         if (tokenFromEnv) return;
         return persistCredentials({ ...credentials, cookies });
      },
   });

   return {
      runtime,
      logger,
      cwd,
      env: { ...env, apiUrl },
      credentialsFile,
      credentials,
      client,
      assumeYes: options.yes ?? false,
      persistCredentials,
   };
};
