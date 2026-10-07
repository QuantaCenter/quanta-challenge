import { EXIT, type ExitCode } from './exit-codes';

export interface CliErrorOptions {
   /** 给用户的下一步动作建议，打印在错误下方 */
   hint?: string;
   /** 结构化上下文（HTTP 状态码、响应片段、文件路径……），--json 时原样输出 */
   details?: Record<string, unknown>;
   exitCode?: ExitCode;
   cause?: unknown;
}

/**
 * 所有"可以预期"的错误都继承自 CliError。
 *
 * 这样顶层只需要区分两件事：CliError 打印 message + hint 后按 exitCode 退出；
 * 其它异常视为 bug，打印堆栈（--verbose 时）并退出 1。
 * 直接把 Error 抛到顶层会让用户看到一堆栈，无法判断是自己用错还是程序坏了。
 */
export class CliError extends Error {
   readonly hint: string | undefined;
   readonly details: Record<string, unknown> | undefined;
   readonly exitCode: ExitCode;

   constructor(message: string, options: CliErrorOptions = {}) {
      super(message, { cause: options.cause });
      this.name = new.target.name;
      this.hint = options.hint;
      this.details = options.details;
      this.exitCode = options.exitCode ?? EXIT.FAILURE;
   }
}

/** 参数缺失、配置字段非法等"用户用法"问题 */
export class UsageError extends CliError {
   constructor(
      message: string,
      options: Omit<CliErrorOptions, 'exitCode'> = {},
   ) {
      super(message, { ...options, exitCode: EXIT.USAGE });
   }
}

/** 配置文件缺失 / 无法解析 / 校验失败 */
export class ConfigError extends CliError {
   constructor(
      message: string,
      options: Omit<CliErrorOptions, 'exitCode'> = {},
   ) {
      super(message, { ...options, exitCode: EXIT.USAGE });
   }
}

/** 预检或服务端审计未通过 */
export class PrecheckError extends CliError {
   constructor(
      message: string,
      options: Omit<CliErrorOptions, 'exitCode'> = {},
   ) {
      super(message, { ...options, exitCode: EXIT.PRECHECK_FAILED });
   }
}

/** 未登录、令牌过期、无管理员权限 */
export class AuthError extends CliError {
   constructor(
      message: string,
      options: Omit<CliErrorOptions, 'exitCode'> = {},
   ) {
      super(message, { ...options, exitCode: EXIT.AUTH });
   }
}

/** 网络失败、超时、服务端 5xx */
export class NetworkError extends CliError {
   constructor(
      message: string,
      options: Omit<CliErrorOptions, 'exitCode'> = {},
   ) {
      super(message, { ...options, exitCode: EXIT.NETWORK });
   }
}

/** 服务端 4xx：请求本身被拒绝，通常是参数或权限问题 */
export class ApiError extends CliError {
   readonly status: number;
   readonly path: string;

   constructor(
      message: string,
      options: Omit<CliErrorOptions, 'exitCode'> & {
         status: number;
         path: string;
      },
   ) {
      const { status, path, ...rest } = options;
      super(message, {
         ...rest,
         exitCode: status === 401 || status === 403 ? EXIT.AUTH : EXIT.FAILURE,
         details: { ...rest.details, status, path },
      });
      this.status = status;
      this.path = path;
   }
}

/**
 * 取消（Ctrl-C / 外部 abort）单独建模：它既不是成功也不是失败，
 * 顶层按 130 退出（128 + SIGINT），这是 shell 的通行约定。
 */
export class CanceledError extends CliError {
   constructor(message = '已取消') {
      super(message, { exitCode: EXIT.FAILURE });
   }
}

export const isAbortError = (error: unknown): boolean =>
   error instanceof Error &&
   (error.name === 'AbortError' || error.name === 'TimeoutError');

/** 把任意 catch 值收敛成 CliError，便于统一展示 */
export const toCliError = (error: unknown): CliError => {
   if (error instanceof CliError) return error;
   if (isAbortError(error)) {
      return new CliError('请求已取消或超时', {
         cause: error,
         hint: '网络较慢时可调大 QUANTA_HTTP_TIMEOUT，或检查 API 地址是否可达。',
      });
   }
   if (error instanceof Error) {
      return new CliError(error.message, { cause: error });
   }
   return new CliError(String(error));
};
