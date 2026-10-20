import { relative, resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import {
   CliError,
   ConfigError,
   PrecheckError,
   UsageError,
} from '../core/errors';
import { EXIT } from '../core/exit-codes';
import { applyProblemIdUpdate } from '../domain/config-writer';
import { loadProblemConfig } from '../domain/problem-config';
import { type ValidationReport, validateProblem } from '../domain/validate';
import {
   type AuditDetail,
   auditRecordOf,
   createAdminApi,
   isAuditSettled,
   readAuditResults,
} from '../services/admin-api';
import {
   renderAuditDetail,
   renderFindings,
   validationToJson,
} from '../ui/report';
import { poll } from '../utils/async';
import { readText, writeTextAtomic } from '../utils/fs';
import { formatBytes } from '../utils/paths';
import type { CommandRegistry } from './registry';
import { parseProblemId } from './status';
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
   /** 在该题目 id 下追加新版本（覆盖配置里的 problemId） */
   problem?: string;
   /** 强制新建题目，忽略配置 / 参数里的 problemId */
   new?: boolean;
   /** 把本次使用的题目 id 写回配置 */
   write?: boolean;
}

export const registerUploadCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('upload')
      .description('上传题目（新建或追加版本）并可等待线上审计结果')
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option('--dry-run', '只做预检并打印将要提交的内容')
      .option('--skip-check', '跳过预检（不建议）')
      .option('--wait', '上传后等待审计结果（默认）')
      .option('--no-wait', '上传后不等待审计')
      .option(
         '--problem <pid>',
         '在该题目下追加新版本（覆盖配置里的 problemId）',
      )
      .option('--new', '强制新建题目（忽略配置里的 problemId）')
      .option('--write', '把本次使用的题目 id 写回配置')
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

   // --new 与 --problem 语义互斥，提前拦下比让服务端猜好。
   if (options.new && options.problem !== undefined) {
      throw new UsageError('--new 与 --problem 不能同时使用', {
         hint: '要新建题目就别指定 --problem；要追加版本就别加 --new。',
      });
   }
   // 本次要追加版本的题目 id：--problem > 配置里的 problemId；--new 一律新建。
   const targetProblemId = resolveTargetProblemId(options, config.problemId);

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
      problemType: config.type,
      ...(config.runtime.serviceImage
         ? { serviceImage: config.runtime.serviceImage }
         : {}),
      servicePort: config.runtime.servicePort,
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
      ['题型', config.type],
      ['启动命令', config.runtime.initCommand ?? '<默认>'],
      ['答案模板', `${report.stats.template.fileCount} 个文件`],
      ['参考解', `${report.stats.answer.fileCount} 个文件`],
      ['判题脚本', `${Buffer.byteLength(judgeScript, 'utf8')} 字节`],
      ['请求体', formatBytes(payloadBytes)],
      [
         '目标',
         targetProblemId === undefined
            ? '新建题目'
            : `题目 #${targetProblemId} 的新版本`,
      ],
      [
         '接口',
         `${ctx.env.apiUrl} → ${
            targetProblemId === undefined
               ? 'admin.problem.upload'
               : 'admin.problem.reupload'
         }`,
      ],
   ]);

   if (options.dryRun) {
      ctx.logger.success('--dry-run：未发起任何请求');
      if (ctx.logger.json) {
         ctx.logger.result({
            dryRun: true,
            mode: targetProblemId === undefined ? 'create' : 'version',
            targetProblemId,
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
   const api = createAdminApi(ctx.client);

   // 追加版本时服务端要的是基础题 id（baseId），先按题目 id 查出来。
   let baseId: number | undefined;
   if (targetProblemId !== undefined) {
      ctx.logger.step(`查找题目 #${targetProblemId} 的基础题 id`);
      const target = await api.getAuditDetail(targetProblemId);
      baseId = target.BaseProblem?.id;
      if (baseId === undefined) {
         throw new PrecheckError(
            `题目 #${targetProblemId} 没有关联的基础题，无法追加版本`,
            {
               hint: '确认这个 id 来自 `qpc upload` / 管理端，且属于当前账号。',
            },
         );
      }
   }

   await confirmOrSkip(
      ctx,
      targetProblemId === undefined
         ? '确认创建新题目？'
         : `确认在题目 #${targetProblemId} 下创建新版本？`,
   );

   ctx.logger.step(
      baseId === undefined ? '提交 upload 请求' : '提交 reupload 请求',
   );
   const created =
      baseId === undefined
         ? await api.uploadProblem(payload)
         : await api.reuploadProblem({ ...payload, baseId });
   const problemId = created.problemId;
   ctx.logger.success(
      baseId === undefined
         ? `题目已创建：#${problemId}（${created.message}）`
         : `新版本已创建：#${problemId}（${created.message}）`,
   );

   // 只在整条命令成功后写回：失败时留下 problemId 会把配置指向一道没通过的题。
   // 写回失败不影响上传结果，只警告；否则退出码会诱导调用方重复上传、多造版本。
   const writeBackIfRequested = async (): Promise<WriteBackStatus> => {
      if (!options.write) return 'skipped';
      try {
         const written = await writeBackProblemId(config.configFile, problemId);
         ctx.logger.success(
            `problemId 已写回 ${relative(ctx.cwd, written) || written}`,
         );
         return 'ok';
      } catch (error) {
         ctx.logger.warn(
            `上传已成功，但 problemId 写回失败（${error instanceof Error ? error.message : String(error)}）`,
         );
         ctx.logger.info(
            `  不要重新上传：手动把 "problemId": ${problemId} 填进 ${relative(ctx.cwd, config.configFile) || config.configFile}`,
         );
         return 'failed';
      }
   };

   if (!options.write) {
      if (targetProblemId === undefined && config.problemId === undefined) {
         ctx.logger.info(
            `  加 --write 可把 problemId: ${problemId} 写回配置，之后上传默认在该题目下追加版本`,
         );
      } else if (options.new && config.problemId !== undefined) {
         ctx.logger.warn(
            `  配置里的 problemId: ${config.problemId} 仍指向旧题目；要改用新题目请加 --write`,
         );
      }
   }

   if (options.wait === false) {
      const writeBack = await writeBackIfRequested();
      ctx.logger.info(`  审计状态：qpc status ${problemId} --watch`);
      if (ctx.logger.json) {
         ctx.logger.result({ problemId, waited: false, writeBack });
      }
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

   if (!passed) {
      const failure = classifyAuditFailure(detail);
      if (ctx.logger.json) {
         ctx.logger.result({
            problemId,
            waited: true,
            audit: failure.code,
            retryable: failure.retryable,
            detail,
         });
      }
      const skipped = options.write
         ? '（--write 已跳过：审计未通过不写回 problemId）'
         : '';
      throw new CliError(`题目 #${problemId} 审计未通过：${failure.summary}`, {
         exitCode: failure.retryable ? EXIT.NETWORK : EXIT.PRECHECK_FAILED,
         hint: `${failure.nextAction}${skipped}`,
         details: {
            code: failure.code,
            retryable: failure.retryable,
            problemId,
            nextAction: failure.nextAction,
         },
      });
   }

   const writeBack = await writeBackIfRequested();
   ctx.logger.success(`审计通过：${detail.totalScore} 分满分`);
   ctx.logger.info(
      `  当前版本：#${problemId}，发布请用 \`qpc publish ${problemId}\``,
   );
   if (ctx.logger.json) {
      ctx.logger.result({
         problemId,
         waited: true,
         audit: 'success',
         writeBack,
         detail,
      });
   }
};

type WriteBackStatus = 'ok' | 'failed' | 'skipped';

export interface AuditFailure {
   /** 机读错误码，与 `qpc agent errors` 对应 */
   code: 'AUDIT_INFRA_ERROR' | 'AUDIT_SCRIPT_ERROR' | 'AUDIT_CHECKPOINT_FAILED';
   /** 平台侧故障：与题目内容无关，原样重试即可 */
   retryable: boolean;
   summary: string;
   nextAction: string;
}

const INFRA_ERROR_PATTERN =
   /prisma|No record was found|Judge Machine|ECONNREFUSED|ECONNRESET|socket hang up|container/i;

/** 把审计失败分成三类，避免把平台故障误报成"题目有问题"而诱导改题。 */
export const classifyAuditFailure = (detail: AuditDetail): AuditFailure => {
   const retry = `与题目内容无关，不要修改题目：原样重跑 \`qpc upload --write\`（最多 3 次）；仍失败请联系平台管理员。详见 \`qpc agent errors\`。`;
   const record = auditRecordOf(detail);
   if (!record) {
      return {
         code: 'AUDIT_INFRA_ERROR',
         retryable: true,
         summary: '平台没有写回判题记录（审计任务丢失或判题机崩溃）',
         nextAction: retry,
      };
   }
   if (record.result === 'pending') {
      return {
         code: 'AUDIT_INFRA_ERROR',
         retryable: true,
         summary: `题目状态已是 ${detail.status}，但判题记录仍是 pending（审计任务丢失）`,
         nextAction: retry,
      };
   }
   const { results, errorMessage } = readAuditResults(record);
   if (results.length === 0) {
      if (!errorMessage || INFRA_ERROR_PATTERN.test(errorMessage)) {
         return {
            code: 'AUDIT_INFRA_ERROR',
            retryable: true,
            summary: `平台侧审计执行失败${errorMessage ? `（${errorMessage.slice(0, 120)}）` : ''}`,
            nextAction: retry,
         };
      }
      return {
         code: 'AUDIT_SCRIPT_ERROR',
         retryable: false,
         summary: `判题脚本整体执行失败（${errorMessage.slice(0, 120)}）`,
         nextAction:
            '脚本级异常会让所有检查点作废（常见：超过 20 秒预算、语法错误、用了沙箱里没有的 setTimeout/fetch）。先跑 `qpc check` 在本地复现并修好，再 `qpc upload --write`。',
      };
   }
   const failed = results.filter((item) => item.status !== 'pass');
   return {
      code: 'AUDIT_CHECKPOINT_FAILED',
      retryable: false,
      summary:
         failed.length > 0
            ? `参考解没有拿满分（${failed.length} 个检查点未通过）`
            : `审计得分 ${record.score} 与 totalScore ${detail.totalScore} 不一致`,
      nextAction:
         '按上面 ✖ 的检查点原因修改 judge.js 或 answer/；先跑 `qpc check` 在本地复现到满分，再 `qpc upload --write`。',
   };
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
         if (isAuditSettled(current)) return current;
         ctx.logger.detail(`审计进行中…（status=${current.status}）`);
         return undefined;
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

/** 本次要追加版本的题目 id：--problem > 配置里的 problemId；--new 一律新建 */
const resolveTargetProblemId = (
   options: UploadOptions,
   configuredProblemId: number | undefined,
): number | undefined => {
   if (options.new) return undefined;
   if (options.problem !== undefined) return parseProblemId(options.problem);
   return configuredProblemId;
};

// 写回后重新加载配置验证，对不上就回滚（同 qpc cover --write）。
const writeBackProblemId = async (
   configFile: string,
   problemId: number,
): Promise<string> => {
   const original = await readText(configFile);
   const patched = applyProblemIdUpdate(original, problemId, configFile);
   await writeTextAtomic(configFile, patched);
   try {
      const reloaded = await loadProblemConfig(resolve(configFile, '..'));
      if (reloaded.problemId !== problemId) {
         throw new Error('写回后读取到的 problemId 与预期不一致');
      }
   } catch (error) {
      await writeTextAtomic(configFile, original);
      throw new ConfigError('写回 problemId 后配置校验失败，已回滚原文件', {
         cause: error,
         hint: `手动把 problemId: ${problemId} 填进配置。`,
      });
   }
   return configFile;
};
