import { createColors } from 'picocolors';

/** picocolors 的类型入口是 `export =`，拿不到具名类型导出，用 ReturnType 取 */
type Colors = ReturnType<typeof createColors>;

export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
   silent: 0,
   error: 1,
   warn: 2,
   info: 3,
   debug: 4,
};

export const isLogLevel = (value: string): value is LogLevel =>
   (LOG_LEVELS as readonly string[]).includes(value);

export interface Logger {
   readonly level: LogLevel;
   readonly json: boolean;
   error(message: string, meta?: Record<string, unknown>): void;
   warn(message: string, meta?: Record<string, unknown>): void;
   info(message: string, meta?: Record<string, unknown>): void;
   debug(message: string, meta?: Record<string, unknown>): void;
   /** 步骤标题：▸ 解析配置 */
   step(message: string): void;
   /** 成功项：✔ 审计通过 */
   success(message: string): void;
   /** 失败项：✖ 检查点缺少 return */
   fail(message: string): void;
   /** 缩进的补充信息 */
   detail(message: string): void;
   /** 空行：避免出现 `[i] ` 这种带前缀的空行 */
   blank(): void;
   /** 机器可读结果，写到 stdout（--json 时是人类可读输出的替代品） */
   result(payload: unknown): void;
   colors: Colors;
   /** 两列对齐表格，用于 findings / 状态清单 */
   table(rows: Array<[string, string]>): void;
}

export interface LoggerOptions {
   level?: LogLevel;
   json?: boolean;
   color?: boolean;
   stdout?: (chunk: string) => void;
   stderr?: (chunk: string) => void;
}

const write = (target: (chunk: string) => void, line: string) =>
   target(`${line}\n`);

/**
 * 输出通道约定：
 *
 * · stdout = **命令结果**（报告表格、预检结论、`--json` 的 JSON）。
 * · stderr = **诊断信息**（错误、警告、debug、以及 `--json` 模式下的全部日志）。
 *
 * 这样 `qpc status 12 --json | jq .status` 永远只拿到一份 JSON，不会被日志污染；
 * 而管道里看不到的进度信息仍然会打到终端上。
 * `--json` 时表格不再输出（数据已经在 JSON 里），避免 stdout 出现两种格式。
 */
export const createLogger = (options: LoggerOptions = {}): Logger => {
   const level = options.level ?? 'info';
   const json = options.json ?? false;
   const colors = createColors(options.color ?? true);
   const stdout =
      options.stdout ?? ((chunk: string) => process.stdout.write(chunk));
   const stderr =
      options.stderr ?? ((chunk: string) => process.stderr.write(chunk));

   const enabled = (candidate: LogLevel) =>
      LOG_LEVEL_RANK[candidate] <= LOG_LEVEL_RANK[level] && level !== 'silent';

   const emit = (
      candidate: Exclude<LogLevel, 'silent'>,
      symbol: string,
      message: string,
      meta?: Record<string, unknown>,
      stream: 'stdout' | 'stderr' = 'stderr',
   ) => {
      if (!enabled(candidate)) return;
      if (json) {
         write(
            stderr,
            JSON.stringify({ level: candidate, msg: message, ...meta }),
         );
         return;
      }
      const target = stream === 'stdout' ? stdout : stderr;
      const label = symbol ? `${symbol} ` : '';
      write(target, `${label}${message}`);
      if (meta && Object.keys(meta).length > 0) {
         write(target, colors.dim(`   ${JSON.stringify(meta)}`));
      }
   };

   const symbols = colors.isColorSupported
      ? {
           info: colors.blue('ℹ'),
           warn: colors.yellow('▲'),
           error: colors.red('✖'),
           step: colors.cyan('▸'),
           success: colors.green('✔'),
           fail: colors.red('✖'),
        }
      : {
           info: '[i]',
           warn: '[!]',
           error: '[x]',
           step: '>',
           success: '[ok]',
           fail: '[x]',
        };

   return {
      level,
      json,
      colors,
      error: (message, meta) => emit('error', symbols.error, message, meta),
      warn: (message, meta) =>
         emit('warn', symbols.warn, colors.yellow(message), meta),
      info: (message, meta) =>
         emit('info', symbols.info, message, meta, 'stdout'),
      debug: (message, meta) =>
         emit('debug', colors.dim('·'), colors.dim(message), meta),
      step: (message) =>
         emit('info', symbols.step, colors.bold(message), undefined, 'stdout'),
      success: (message) =>
         emit(
            'info',
            symbols.success,
            colors.green(message),
            undefined,
            'stdout',
         ),
      fail: (message) => emit('error', symbols.fail, colors.red(message)),
      detail: (message) =>
         emit('info', '', colors.dim(`  ${message}`), undefined, 'stdout'),
      blank: () => {
         if (json || level === 'silent') return;
         write(stderr, '');
      },
      result: (payload) => {
         write(stdout, json ? JSON.stringify(payload) : String(payload));
      },
      table: (rows) => {
         if (json || rows.length === 0) return;
         const width = Math.max(...rows.map(([key]) => displayWidth(key)));
         for (const [key, value] of rows) {
            const pad = ' '.repeat(Math.max(0, width - displayWidth(key)));
            write(stdout, `  ${key}${pad}  ${value}`);
         }
      },
   };
};

/** CJK 字符占两列宽，表格对齐必须区分处理，否则中文键名会错位 */
const displayWidth = (text: string): number => {
   let width = 0;
   for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      width += code >= 0x1100 && isWide(code) ? 2 : 1;
   }
   return width;
};

const isWide = (code: number): boolean =>
   (code >= 0x1100 && code <= 0x115f) ||
   (code >= 0x2e80 && code <= 0xa4cf) ||
   (code >= 0xac00 && code <= 0xd7a3) ||
   (code >= 0xf900 && code <= 0xfaff) ||
   (code >= 0xfe30 && code <= 0xfe6f) ||
   (code >= 0xff00 && code <= 0xff60) ||
   (code >= 0xffe0 && code <= 0xffe6);
