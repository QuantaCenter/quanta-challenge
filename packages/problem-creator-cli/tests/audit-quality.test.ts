import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAuditFailure } from '../src/commands/upload';
import { createLogger } from '../src/core/logger';
import type { AuditDetail } from '../src/services/admin-api';
import { auditToJson, renderAuditDetail } from '../src/ui/report';

const failedAudit: AuditDetail = {
   pid: 123,
   title: '测试题目',
   totalScore: 100,
   status: 'invalid',
   difficulty: 'easy',
   tags: [],
   TemplateJudgeRecord: [
      {
         judgeRecord: {
            id: 1,
            result: 'failed',
            score: 0,
            type: 'audit',
            info: {
               errorMessage:
                  'AI 质量审核或判题投递未完成，请查看质量报告后重新提交。',
            },
         },
      },
   ],
};

test('quality rejection appears in the unified audit result with its full reason', () => {
   const detail: AuditDetail = {
      ...failedAudit,
      QualityReviews: [
         {
            status: 'rejected',
            report: { status: 'reject', reason: '提示直接输出大量坐标。' },
         },
      ],
   };
   const output: string[] = [];
   const logger = createLogger({
      color: false,
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line),
   });

   assert.equal(renderAuditDetail(logger, detail), false);
   assert.match(output.join(''), /AI 质量审核：提示直接输出大量坐标。/);
   assert.equal(classifyAuditFailure(detail).code, 'AUDIT_QUALITY_REJECTED');
   assert.deepEqual(auditToJson(detail).qualityReview, {
      status: 'rejected',
      reason: '提示直接输出大量坐标。',
      errorCode: null,
   });
});

test('model errors are infrastructure failures, and old server responses still work', () => {
   const unavailable: AuditDetail = {
      ...failedAudit,
      QualityReviews: [
         { status: 'error', errorCode: 'QUALITY_RATE_LIMITED', report: null },
      ],
   };
   const failure = classifyAuditFailure(unavailable);
   assert.equal(failure.code, 'AUDIT_INFRA_ERROR');
   assert.equal(failure.retryable, true);
   assert.match(failure.summary, /QUALITY_RATE_LIMITED/);

   const oldServer: AuditDetail = {
      ...failedAudit,
      TemplateJudgeRecord: [
         {
            judgeRecord: {
               ...failedAudit.TemplateJudgeRecord![0]!.judgeRecord,
               info: { errorMessage: '脚本运行异常' },
            },
         },
      ],
   };
   assert.equal(classifyAuditFailure(oldServer).code, 'AUDIT_SCRIPT_ERROR');
   assert.equal('qualityReview' in auditToJson(oldServer), false);
});
