import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { PrecheckError, UsageError } from '../core/errors';
import { loadProblemConfig } from '../domain/problem-config';
import { type ValidationReport, validateProblem } from '../domain/validate';
import { type AuditDetail, createAdminApi } from '../services/admin-api';
import {
   renderAuditDetail,
   renderFindings,
   validationToJson,
} from '../ui/report';
import { poll } from '../utils/async';
import { readText } from '../utils/fs';
import { formatBytes } from '../utils/paths';
import type { CommandRegistry } from './registry';
import { confirmOrSkip, requireSession } from './support';

export interface UploadOptions {
   dir: string;
   /** 只打印将要提交的内容，不发请求 */
   dryRun?: boolean;
   /** 跳过预检（不推荐：等于把静态错误留给线上） */
   skipCheck?: boolean;
   /** 上传后等待审计结果，默认 true */
   wait?: boolean;
   /** 审计等待超时（秒） */
   timeout?: string;
   /** 轮询间隔（秒） */
   interval?: string;
}

export const registerUploadCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('upload')
      .description('上传题目（创建新版本）并可等待线上审计结果')
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option('--dry-run', '只做预检并打印将要提交的内容')
      .option('--skip-check', '跳过预检（不建议）')
      .option('--no-wait', '上传后不等待审计')
      .option('--timeout <seconds>', '审计等待超时（秒）', '180')
      .option('--interval <seconds>', '审计状态轮询间隔（秒）', '2')
      .action(async (dir: string, options: Omit<UploadOptions, 'dir'>) => {
         const ctx = await context();
         await runUpload(ctx, { dir, ...options });
      });
};

export const runUpload = async (
   ctx: CommandContext,
   options: UploadOptions,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   const config = await loadProblemConfig(rootDir);

   let report: ValidationReport;
   if (options.skipCheck) {
      ctx.logger.warn(
         '已跳过预检（--skip-check）：静态错误会留到线上审计才暴露',
      );
      report = await validateProblem(config, {
         maxUploadBytes: ctx.env.maxUploadBytes,
      });
   } else {
      report = await validateProblem(config, {
         maxUploadBytes: ctx.env.maxUploadBytes,
      });
      renderFindings(ctx.logger, report.findings);
      if (!report.ok) {
         throw new PrecheckError(
            `预检未通过：${report.errors} 个错误，已中止上传`,
            {
               hint: '修复后重跑；确实要强行上传时用 --skip-check。',
            },
         );
      }
   }

   const judgeScript = await readText(config.paths.judge);
   const payload = {
      title: config.title,
      detail: config.detail,
      tagIds: config.tagIds,
      difficulty: config.difficulty,
      totalScore: report.totalScore,
      judgeScript,
      answerTemplateSnapshot: report.templateSnapshot,
      referenceAnswerSnapshot: report.answerSnapshot,
      coverMode: config.cover.mode,
      ...(config.cover.mode === 'custom'
         ? { coverImageId: config.cover.imageId }
         : {}),
      ...(config.runtime.bootCommand
         ? { bootCommand: config.runtime.bootCommand }
         : {}),
      ...(config.runtime.buildCommand
         ? { buildCommand: config.runtime.buildCommand }
         : {}),
      initCommand: config.runtime.initCommand,
      judgeUploadPath: config.runtime.judgeUploadPath,
   };

   const payloadBytes =
      Buffer.byteLength(judgeScript, 'utf8') +
      report.stats.template.totalBytes +
      report.stats.answer.totalBytes;

   ctx.logger.step('上传内容摘要');
   ctx.logger.table([
      ['标题', config.title],
      ['难度 / 总分', `${config.difficulty} / ${report.totalScore}`],
      ['标签', config.tagIds.join(', ')],
      ['判题打包目录', config.runtime.judgeUploadPath],
      ['启动命令', config.runtime.initCommand ?? '<默认>'],
      ['答案模板', `${report.stats.template.fileCount} 个文件`],
      ['参考解', `${report.stats.answer.fileCount} 个文件`],
      ['判题脚本', `${Buffer.byteLength(judgeScript, 'utf8')} 字节`],
      ['请求体', formatBytes(payloadBytes)],
      ['接口', `${ctx.env.apiUrl} → admin.problem.upload`],
   ]);

   if (options.dryRun) {
      ctx.logger.success('--dry-run：未发起任何请求');
      if (ctx.logger.json) {
         ctx.logger.result({
            dryRun: true,
            payload: {
               ...payload,
               judgeScript: `<${judgeScript.length} 字符>`,
               answerTemplateSnapshot: `<${report.stats.template.fileCount} 个文件>`,
               referenceAnswerSnapshot: `<${report.stats.answer.fileCount} 个文件>`,
            },
            validation: validationToJson(report),
         });
      }
      return;
   }

   requireSession(ctx);
   await confirmOrSkip(ctx, '确认创建新的题目版本？');

   const api = createAdminApi(ctx.client);
   ctx.logger.step('提交 upload 请求');
   const created = await api.uploadProblem(payload);
   const problemId = created.problemId;
   ctx.logger.success(`题目已创建：#${problemId}（${created.message}）`);

   if (options.wait === false) {
      ctx.logger.info(`  审计状态：qpc status ${problemId} --watch`);
      if (ctx.logger.json) ctx.logger.result({ problemId, waited: false });
      return;
   }

   const detail = await waitForAudit(
      ctx,
      problemId,
      options.timeout,
      options.interval,
   );
   const passed = renderAuditDetail(ctx.logger, detail, {
      verbose: ctx.logger.level === 'debug',
   });

   if (ctx.logger.json) ctx.logger.result({ problemId, waited: true, detail });

   if (!passed) {
      throw new PrecheckError(`题目 #${problemId} 审计未通过`, {
         hint: '看上面的检查点明细：分数不等通常是"参考解拿不到满分"或"totalScore 与检查点之和不一致"。',
      });
   }

   ctx.logger.success(`审计通过：${detail.totalScore} 分满分`);
   ctx.logger.info(`  发布：qpc publish ${problemId}`);
};

/** 轮询审计状态直到 judgeRecord 不再是 pending */
export const waitForAudit = async (
   ctx: CommandContext,
   problemId: number,
   timeoutSeconds?: string,
   intervalSeconds?: string,
): Promise<AuditDetail> => {
   const api = createAdminApi(ctx.client);
   const timeoutMs = parsePositiveSeconds(timeoutSeconds, 180) * 1_000;
   const intervalMs = parsePositiveSeconds(intervalSeconds, 2) * 1_000;
   ctx.logger.step(`等待审计结果（最多 ${Math.round(timeoutMs / 1000)} 秒）`);

   const detail = await poll<AuditDetail>({
      intervalMs,
      timeoutMs,
      signal: ctx.runtime.signal,
      probe: async () => {
         const current = await api.getAuditDetail(problemId);
         const record = current.TemplateJudgeRecord?.[0]?.judgeRecord;
         if (!record) return undefined;
         if (record.result === 'pending') {
            ctx.logger.detail(`审计进行中…（status=${current.status}）`);
            return undefined;
         }
         return current;
      },
   });

   if (!detail) {
      throw new PrecheckError(`等待审计超时（题目 #${problemId}）`, {
         hint: `可能原因：调度器未运行 / 判题机容器起不来。检查 qpc status ${problemId}，并看调度器日志。`,
      });
   }

   return detail;
};

/** 秒数参数统一在这里校验：负数/NaN 必须变成用法错误而不是静默取默认值 */
const parsePositiveSeconds = (
   value: string | undefined,
   fallback: number,
): number => {
   if (value === undefined) return fallback;
   const seconds = Number.parseFloat(value);
   if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new UsageError(`时间参数必须是正数（秒）：${value}`);
   }
   return seconds;
};
