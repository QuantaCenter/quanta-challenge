import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import { createAdminApi } from '../services/admin-api';
import { auditToJson, renderAuditDetail } from '../ui/report';
import { sleep } from '../utils/async';
import type { CommandRegistry } from './registry';
import { requireSession } from './support';

export interface StatusOptions {
   problemId: string;
   watch?: boolean;
   interval?: string;
}

export const registerStatusCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('status')
      .description('查看题目状态与最近一次审计的检查点明细')
      .argument('<problemId>', '题目版本 id（upload 返回的 pid）')
      .option('--watch', '持续刷新，直到审计出结果（Ctrl-C 退出）')
      .option('--interval <seconds>', '刷新间隔（秒）', '3')
      .action(
         async (
            problemId: string,
            options: Omit<StatusOptions, 'problemId'>,
         ) => {
            const ctx = await context();
            await runStatus(ctx, { problemId, ...options });
         },
      );
};

export const runStatus = async (
   ctx: CommandContext,
   options: StatusOptions,
): Promise<void> => {
   const problemId = parseProblemId(options.problemId);
   requireSession(ctx);
   const api = createAdminApi(ctx.client);

   if (!options.watch) {
      const detail = await api.getAuditDetail(problemId);
      renderAuditDetail(ctx.logger, detail, {
         verbose: ctx.logger.level === 'debug',
      });
      if (ctx.logger.json) ctx.logger.result(auditToJson(detail));
      return;
   }

   const intervalMs = parseInterval(options.interval);
   let lastSignature = '';
   for (;;) {
      if (ctx.runtime.signal?.aborted) return;
      const detail = await api.getAuditDetail(problemId);
      const record = detail.TemplateJudgeRecord?.[0]?.judgeRecord;
      const signature = `${detail.status}|${record?.result ?? 'none'}|${record?.score ?? 0}`;
      if (signature !== lastSignature) {
         lastSignature = signature;
         ctx.logger.blank();
         renderAuditDetail(ctx.logger, detail, {
            verbose: ctx.logger.level === 'debug',
         });
      } else {
         ctx.logger.detail(`状态未变化（${signature}）`);
      }

      if (record && record.result !== 'pending') {
         if (ctx.logger.json) ctx.logger.result(auditToJson(detail));
         ctx.logger.success('审计已出结果，停止刷新');
         return;
      }
      await sleep(intervalMs, ctx.runtime.signal);
   }
};

export const parseProblemId = (value: string): number => {
   const parsed = Number.parseInt(value, 10);
   if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new UsageError(`题目 id 必须是正整数：${value}`, {
         hint: 'id 来自 `qpc upload` 的输出，或管理端题目列表。',
      });
   }
   return parsed;
};

const parseInterval = (value: string | undefined): number => {
   const seconds = Number.parseFloat(value ?? '3');
   if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new UsageError(`--interval 必须是正数（秒）：${value}`);
   }
   return seconds * 1_000;
};
