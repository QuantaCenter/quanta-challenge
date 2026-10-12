import { relative, resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { ConfigError, PrecheckError, UsageError } from '../core/errors';
import { applyProblemIdUpdate } from '../domain/config-writer';
import { loadProblemConfig } from '../domain/problem-config';
import { type ValidationReport, validateProblem } from '../domain/validate';
import {
   type AuditDetail,
   auditRecordOf,
   createAdminApi,
   isAuditSettled,
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
      [
         '构建命令',
         config.runtime.buildCommand ?? '<未配置：编辑器里点提交不会有反应>',
      ],
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
   const writeBackIfRequested = async (): Promise<void> => {
      if (!options.write) return;
      const written = await writeBackProblemId(config.configFile, problemId);
      ctx.logger.success(
         `problemId 已写回 ${relative(ctx.cwd, written) || written}`,
      );
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
      await writeBackIfRequested();
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
      const hasRecord = auditRecordOf(detail) !== undefined;
      const reason = hasRecord
         ? '看上面的检查点明细：分数不等通常是"参考解拿不到满分"或"totalScore 与检查点之和不一致"。'
         : '题目状态已置为 invalid，但判题记录没有写回：多半是判题机/容器出结果前就崩了，看调度器日志。';
      throw new PrecheckError(`题目 #${problemId} 审计未通过`, {
         hint: options.write
            ? `${reason}（--write 已跳过：审计未通过不写回 problemId）`
            : reason,
      });
   }

   await writeBackIfRequested();
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
