import { Command, CommanderError } from 'commander';

import { type CommandRegistry, registerCommands } from './commands';
import { createCommandContext, type GlobalOptions } from './core/context';
import { toCliError } from './core/errors';
import { EXIT } from './core/exit-codes';
import { createLogger } from './core/logger';
import { type CliRuntime, createProcessRuntime } from './core/runtime';
import { CLI_DESCRIPTION, CLI_NAME, CLI_VERSION } from './version';

/**
 * 创建命令树。
 *
 * 注意这里**没有**任何 `process.exit()`：退出码由 runCli 返回给调用方，
 * 这样测试可以在同一个进程里反复跑 CLI（含 --help、参数错误等分支），
 * 而不用 spawn 子进程。
 */
export const createProgram = (runtime: CliRuntime): Command => {
   const program = new Command();

   program
      .name(CLI_NAME)
      .description(CLI_DESCRIPTION)
      .version(CLI_VERSION, '-v, --version', '查看版本号')
      .option(
         '--api <url>',
         'Web 应用地址（默认 QUANTA_API_URL 或 http://localhost:3000）',
      )
      .option(
         '--token <token>',
         '直接使用访问令牌（默认 QUANTA_TOKEN；不会写入凭据文件）',
      )
      .option(
         '--cwd <dir>',
         '工作目录基准（解析顺序：--cwd > INIT_CWD > 进程 cwd）',
      )
      .option('--json', '输出机器可读 JSON（stdout 只有结果，日志走 stderr）')
      .option('--quiet', '隐藏进度信息，只保留错误与命令结果')
      .option('--verbose', '输出调试信息')
      .option('--no-color', '禁用彩色输出')
      .option('-y, --yes', '跳过交互确认（CI 必给）')
      .showHelpAfterError('（用 `qpc --help` 查看全部用法）')
      .configureOutput({
         writeOut: (chunk) => runtime.stdout(chunk),
         writeErr: (chunk) => runtime.stderr(chunk),
      })
      .exitOverride();

   /**
    * 全局参数解析。
    *
    * `--no-color` 在 commander 里的含义是"color 默认 true"，因此不能靠
    * `options.color !== undefined` 判断用户是否显式指定；必须看选项来源。
    * 否则在管道/CI（非 TTY）里也会输出 ANSI 转义序列，日志变成乱码。
    */
   const globals = (): GlobalOptions => {
      const options = program.opts<Record<string, unknown>>();
      const colorExplicit = program.getOptionValueSource('color') === 'cli';
      return {
         api: asString(options.api),
         token: asString(options.token),
         cwd: asString(options.cwd),
         json: Boolean(options.json),
         quiet: Boolean(options.quiet),
         verbose: Boolean(options.verbose),
         yes: Boolean(options.yes),
         color: colorExplicit ? Boolean(options.color) : undefined,
      };
   };

   const registry: CommandRegistry = {
      program,
      context: () => createCommandContext(globals(), runtime),
   };
   registerCommands(registry);

   return program;
};

export const runCli = async (
   argv: string[],
   runtime: CliRuntime = createProcessRuntime(),
): Promise<number> => {
   const program = createProgram(runtime);
   try {
      await program.parseAsync(argv, { from: 'node' });
      return EXIT.OK;
   } catch (error) {
      if (error instanceof CommanderError) {
         // --help / --version 走的是异常通道，但它们是成功而不是失败
         return error.exitCode === 0 ? EXIT.OK : EXIT.USAGE;
      }

      const cliError = toCliError(error);
      const json = argv.includes('--json');
      const logger = createLogger({
         level: 'debug',
         json,
         color: runtime.isTTY ?? false,
         stdout: runtime.stdout,
         stderr: runtime.stderr,
      });

      if (json) {
         logger.result({
            ok: false,
            error: {
               name: cliError.name,
               message: cliError.message,
               hint: cliError.hint,
               details: cliError.details,
               exitCode: cliError.exitCode,
            },
         });
      } else {
         logger.error(cliError.message);
         if (cliError.hint) logger.info(`  ${cliError.hint}`);
         if (cliError.details && argv.includes('--verbose')) {
            logger.detail(JSON.stringify(cliError.details, null, 3));
         }
         if (!(error instanceof Error) || !(error instanceof CommanderError)) {
            const cause = (cliError as { cause?: unknown }).cause;
            if (
               argv.includes('--verbose') &&
               cause instanceof Error &&
               cause.stack
            ) {
               logger.detail(cause.stack);
            }
         }
      }

      return cliError.exitCode;
   }
};

const asString = (value: unknown): string | undefined =>
   typeof value === 'string' && value.length > 0 ? value : undefined;
