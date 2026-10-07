import type { Logger } from '../core/logger';
import type { Finding, Severity, ValidationReport } from '../domain/validate';
import { type AuditDetail, readAuditResults } from '../services/admin-api';
import { formatBytes } from '../utils/paths';

const SEVERITY_LABEL: Record<Severity, string> = {
   error: '错误',
   warn: '警告',
   info: '提示',
};

const SEVERITY_ORDER: Severity[] = ['error', 'warn', 'info'];

export interface RenderFindingsOptions {
   /** 低调模式：info 只在 --verbose 时展示 */
   includeInfo?: boolean;
}

/**
 * 人类可读的预检报告。
 *
 * 输出格式刻意做成 `<文件>:<行> [规则号] 说明`：
 * VS Code 终端、iTerm、以及大多数编辑器的"跳转到文件"都能识别这种格式，
 * 出题人不需要自己找行号。
 */
export const renderFindings = (
   logger: Logger,
   findings: Finding[],
   options: RenderFindingsOptions = {},
): void => {
   const { colors } = logger;
   for (const severity of SEVERITY_ORDER) {
      const group = findings.filter((finding) => finding.severity === severity);
      if (group.length === 0) continue;
      if (severity === 'info' && !options.includeInfo) continue;

      const color =
         severity === 'error'
            ? colors.red
            : severity === 'warn'
              ? colors.yellow
              : colors.dim;
      logger.info(`${color(`${SEVERITY_LABEL[severity]} × ${group.length}`)}`);
      for (const finding of group) {
         const location = finding.file
            ? `${finding.file}${finding.line ? `:${finding.line}` : ''} `
            : '';
         logger.info(
            `  ${colors.bold(finding.rule)} ${location}${finding.message}`,
         );
         if (finding.hint) logger.detail(finding.hint);
      }
   }
};

export const renderValidationSummary = (
   logger: Logger,
   report: ValidationReport,
   options: { title?: string } = {},
): void => {
   const { colors } = logger;
   logger.step(options.title ?? '预检结果');
   logger.table([
      [
         '检查点',
         `${report.stats.checkpointCount} 个，合计 ${report.totalScore} 分`,
      ],
      [
         '答案模板',
         `${report.stats.template.fileCount} 个文件，${formatBytes(report.stats.template.totalBytes)}`,
      ],
      [
         '参考解',
         `${report.stats.answer.fileCount} 个文件，${formatBytes(report.stats.answer.totalBytes)}`,
      ],
      ['判题脚本', `${report.stats.judgeLines} 行`],
      [
         '结论',
         report.ok
            ? colors.green(`通过（${report.warnings} 条警告）`)
            : colors.red(`未通过（${report.errors} 个错误）`),
      ],
   ]);
};

export const renderAuditDetail = (
   logger: Logger,
   detail: AuditDetail,
   options: { verbose?: boolean } = {},
): boolean => {
   const { colors } = logger;
   const record = detail.TemplateJudgeRecord?.[0]?.judgeRecord;
   const { results, errorMessage } = readAuditResults(record);
   const score = record?.score ?? 0;

   logger.step(`题目 #${detail.pid} ${detail.title}`);
   logger.table([
      ['状态', detail.status],
      ['难度', detail.difficulty],
      ['审计得分', `${score} / ${detail.totalScore}`],
      ['审计结果', record?.result ?? 'unknown'],
   ]);

   for (const [index, item] of results.entries()) {
      const mark = item.status === 'pass' ? colors.green('✔') : colors.red('✖');
      logger.info(
         `  ${mark} [${index + 1}] ${item.score}/${item.totalScore}  ${item.details ?? ''}`,
      );
   }
   if (errorMessage) logger.error(`审计执行失败：${errorMessage}`);
   if (options.verbose && detail.JudgeFile?.[0]?.judgeScript) {
      logger.debug(`判题脚本 ${detail.JudgeFile[0].judgeScript.length} 字符`);
   }

   return (
      record?.result === 'success' &&
      detail.totalScore > 0 &&
      score === detail.totalScore
   );
};

/** --json 输出：机器可读的稳定结构（字段名变更视为破坏性变更） */
export const validationToJson = (
   report: ValidationReport,
): Record<string, unknown> => ({
   ok: report.ok,
   totalScore: report.totalScore,
   errors: report.errors,
   warnings: report.warnings,
   stats: report.stats,
   checkpoints: report.analysis.checkpoints,
   findings: report.findings,
});

export const auditToJson = (detail: AuditDetail): Record<string, unknown> => {
   const record = detail.TemplateJudgeRecord?.[0]?.judgeRecord;
   return {
      problemId: detail.pid,
      title: detail.title,
      status: detail.status,
      totalScore: detail.totalScore,
      audit: record
         ? {
              result: record.result,
              score: record.score,
              ...readAuditResults(record),
           }
         : null,
   };
};
