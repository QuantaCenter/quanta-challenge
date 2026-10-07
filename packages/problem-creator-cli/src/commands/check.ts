import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { PrecheckError } from '../core/errors';
import { loadProblemConfig } from '../domain/problem-config';
import { type ValidationReport, validateProblem } from '../domain/validate';
import { createJudgeApi } from '../services/judge-api';
import {
   renderFindings,
   renderValidationSummary,
   validationToJson,
} from '../ui/report';
import { readText } from '../utils/fs';
import type { CommandRegistry } from './registry';

export interface CheckOptions {
   dir: string;
   /** 警告也视为失败，适合放进 CI */
   strict?: boolean;
   /** 额外让判题调度器编译一次脚本（需要调度器在跑） */
   judge?: boolean;
}

export const registerCheckCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('check')
      .description('离线预检题目（判题脚本、快照、分值、运行配置）')
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option('--strict', '警告也视为失败')
      .option('--judge', '额外调用判题调度器的 /code/extract 验证脚本可编译')
      .action(async (dir: string, options: Omit<CheckOptions, 'dir'>) => {
         const ctx = await context();
         await runCheck(ctx, { dir, ...options });
      });
};

export const runCheck = async (
   ctx: CommandContext,
   options: CheckOptions,
): Promise<ValidationReport> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   ctx.logger.step(`读取题目配置 → ${rootDir}`);
   const config = await loadProblemConfig(rootDir);
   ctx.logger.detail(`title: ${config.title}`);

   const report = await validateProblem(config, {
      maxUploadBytes: ctx.env.maxUploadBytes,
   });

   if (options.judge) {
      await verifyWithJudge(ctx, report, config.paths.judge);
   }

   renderFindings(ctx.logger, report.findings, {
      includeInfo: ctx.logger.level === 'debug',
   });
   renderValidationSummary(ctx.logger, report);

   if (ctx.logger.json) {
      ctx.logger.result(validationToJson(report));
   }

   if (!report.ok) {
      throw new PrecheckError(
         `预检未通过：${report.errors} 个错误、${report.warnings} 条警告`,
         {
            hint: '按上面的规则号逐条修复后重跑 `qpc check`。',
         },
      );
   }
   if (options.strict && report.warnings > 0) {
      throw new PrecheckError(`--strict：存在 ${report.warnings} 条警告`, {
         hint: '去掉 --strict 可只拦截错误；警告不影响线上审计。',
      });
   }

   ctx.logger.success('预检通过');
   return report;
};

/**
 * 让判题调度器真的编译一次脚本。
 *
 * 这一步能抓到静态分析抓不到的问题：脚本虽然写了 `export default`，
 * 但 default export 的**不是** `defineTestHandler(...)` 调用
 * （比如包了一层变量），此时服务端 extract 会返回 null 或丢掉检查点。
 */
const verifyWithJudge = async (
   ctx: CommandContext,
   report: ValidationReport,
   judgePath: string,
): Promise<void> => {
   const api = createJudgeApi({
      baseUrl: ctx.env.judgeUrl,
      fetch: ctx.runtime.fetch,
      timeoutMs: ctx.env.timeoutMs,
      signal: ctx.runtime.signal,
   });

   ctx.logger.step(`调用判题调度器编译脚本 → ${ctx.env.judgeUrl}`);
   const extracted = await api.extractJudgeScript(await readText(judgePath));

   if (extracted.includes('export default')) {
      throw new PrecheckError('编译后的脚本里仍残留 `export default`', {
         details: { judgePath },
         hint: '判题机靠把 `export default ` 替换成 `const run = ` 来执行脚本。',
      });
   }

   const extractedCheckpoints = (extracted.match(/defineCheckPoint/g) ?? [])
      .length;
   if (extractedCheckpoints !== report.analysis.checkpoints.length) {
      throw new PrecheckError(
         `编译后检查点数量不一致：本地 ${report.analysis.checkpoints.length}，编译产物 ${extractedCheckpoints}`,
         {
            hint: '检查检查点是否写在 default export 之外（例如写在了模块顶层）。',
         },
      );
   }

   ctx.logger.success(`脚本可编译，编译产物 ${extracted.length} 字符`);
};
