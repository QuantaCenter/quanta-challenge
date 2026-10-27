import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { PrecheckError } from '../core/errors';
import { loadProblemConfig } from '../domain/problem-config';
import {
   type Finding,
   type ValidationReport,
   validateProblem,
} from '../domain/validate';
import {
   type LocalJudgeOutcome,
   type LocalJudgeRun,
   runLocalJudge,
} from '../services/local-judge/runner';
import { SCRIPT_BUDGET_MS } from '../services/local-judge/sandbox';
import {
   renderFindings,
   renderValidationSummary,
   validationToJson,
} from '../ui/report';
import type { CommandRegistry } from './registry';

export interface CheckOptions {
   dir: string;
   /** 警告也视为失败，适合放进 CI */
   strict?: boolean;
   /** 本地微判题（默认开启，--no-run 关闭） */
   run?: boolean;
}

export const registerCheckCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('check')
      .description(
         '检查题目：① 基础信息静态预检 ② 本地微判题（answer 须满分、template 须失分）',
      )
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option('--strict', '警告也视为失败')
      .option('--no-run', '只做静态预检，跳过本地微判题')
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
   ctx.logger.step(`① 基础信息检查 → ${rootDir}`);
   const config = await loadProblemConfig(rootDir);
   ctx.logger.detail(`title: ${config.title}`);

   const report = await validateProblem(config, {
      maxUploadBytes: ctx.env.maxUploadBytes,
   });

   renderFindings(ctx.logger, report.findings, {
      includeInfo: ctx.logger.level === 'debug',
   });
   renderValidationSummary(ctx.logger, report);

   if (!report.ok) {
      if (ctx.logger.json) ctx.logger.result(validationToJson(report));
      throw new PrecheckError(
         `预检未通过：${report.errors} 个错误、${report.warnings} 条警告`,
         {
            hint: '按上面的规则号逐条修复后重跑 `qpc check`（规则说明见 `qpc agent check`）。',
         },
      );
   }

   let localJudge: LocalJudgeOutcome | undefined;
   if (options.run !== false) {
      ctx.logger.step('② 本地微判题（与线上判题机同构的沙箱）');
      localJudge = await runLocalJudge(config, report.totalScore, (message) =>
         ctx.logger.detail(message),
      );
      for (const run of localJudge.runs) renderRun(ctx, run);
      const findings = evaluateLocalJudge(localJudge, report.totalScore);
      renderFindings(ctx.logger, findings);
      report.findings.push(...findings);
      report.errors += findings.filter((f) => f.severity === 'error').length;
      report.warnings += findings.filter((f) => f.severity === 'warn').length;
      report.ok = report.errors === 0;
   }

   if (ctx.logger.json) {
      ctx.logger.result({ ...validationToJson(report), localJudge });
   }

   if (!report.ok) {
      throw new PrecheckError(
         `本地微判题未通过：${report.errors} 个错误、${report.warnings} 条警告`,
         {
            hint: '按 ✖ 检查点的原因修改 judge.js 或 answer/，重跑 `qpc check` 直到参考解满分。',
         },
      );
   }
   if (options.strict && report.warnings > 0) {
      throw new PrecheckError(`--strict：存在 ${report.warnings} 条警告`, {
         hint: '去掉 --strict 可只拦截错误；警告不影响线上审计。',
      });
   }

   ctx.logger.success(
      localJudge && !localJudge.skipped
         ? '检查通过：基础信息无误，参考解本地满分'
         : '预检通过',
   );
   return report;
};

const renderRun = (ctx: CommandContext, run: LocalJudgeRun): void => {
   const { colors } = ctx.logger;
   const title =
      run.label === 'answer' ? '参考解 answer/' : '答案模板 template/';
   ctx.logger.info(
      `${colors.bold(title)}  ${run.score} / ${run.totalScore} 分  ${colors.dim(`${(run.durationMs / 1000).toFixed(1)}s`)}`,
   );
   if (run.error) {
      ctx.logger.info(`  ${colors.red('✖')} 脚本整体失败：${run.error}`);
      return;
   }
   for (const item of run.results) {
      const mark = item.status === 'pass' ? colors.green('✔') : colors.red('✖');
      ctx.logger.info(
         `  ${mark} ${item.name}  ${item.score}/${item.totalScore}  ${colors.dim(`${item.durationMs}ms`)}`,
      );
      if (item.status !== 'pass') ctx.logger.detail(item.details);
   }
};

/** 本地判题结论 → 预检规则（LOC00x），与静态规则一起参与 --strict 判定 */
export const evaluateLocalJudge = (
   outcome: LocalJudgeOutcome,
   totalScore: number,
): Finding[] => {
   if (outcome.skipped) {
      return [
         {
            rule: 'LOC005',
            severity: 'warn',
            message: `已跳过本地微判题：${outcome.skipped.reason}`,
            hint: outcome.skipped.hint,
         },
      ];
   }
   const findings: Finding[] = [];
   const answer = outcome.runs.find((run) => run.label === 'answer');
   const template = outcome.runs.find((run) => run.label === 'template');
   if (answer?.error) {
      findings.push({
         rule: 'LOC001',
         severity: 'error',
         message: `参考解运行时判题脚本整体失败：${answer.error}`,
         hint: '线上会让所有检查点作废。常见原因：超过 20 秒预算、页面/服务没起来、用了沙箱里没有的 setTimeout / fetch / URL。',
      });
   } else if (answer && answer.score !== totalScore) {
      const failed = answer.results
         .filter((item) => item.status !== 'pass')
         .map((item) => item.name);
      findings.push({
         rule: 'LOC002',
         severity: 'error',
         message: `参考解本地得分 ${answer.score} / ${totalScore}，未通过：${failed.join('、') || '<无>'}`,
         hint: '线上审计要求参考解满分。修 judge.js（期望值、选择器、时序）或 answer/。',
      });
   }
   if (answer && answer.durationMs > SCRIPT_BUDGET_MS * 0.75) {
      findings.push({
         rule: 'LOC004',
         severity: 'warn',
         message: `参考解判题耗时 ${(answer.durationMs / 1000).toFixed(1)}s，接近 ${SCRIPT_BUDGET_MS / 1000}s 预算`,
         hint: '线上机器更慢，超时会让所有检查点作废：减少 waitForTimeout，改用 waitForSelector / waitForNetworkIdle。',
      });
   }
   if (template && !template.error && template.score >= totalScore) {
      findings.push({
         rule: 'LOC003',
         severity: 'warn',
         message: '答案模板也拿到了满分：判题脚本抓不到错误',
         hint: '模板应保留 TODO 让学生实现，并确保每个检查点都在验证"学生要做的事"。',
      });
   }
   return findings;
};
