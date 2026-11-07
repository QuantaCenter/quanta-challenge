import assert from 'node:assert/strict';
import test from 'node:test';
import { canSkipQualityReview, previousQualityFeedback, qualityHash, qualityPassed, validateQualityReport } from '../server/utils/judge-quality.ts';
import { createReviewDiff } from '../server/utils/judge-quality-diff.ts';

test('only a valid passing report passes the gate', () => {
   for (const status of ['pass', 'reject', 'needs_review'] as const) {
      assert.equal(qualityPassed(validateQualityReport({ status, reason: '审核结论' })), status === 'pass');
   }
   const invalidReports = [
      { status: 'pass', reason: '' },
      { status: 'unknown', reason: '原因' },
      { status: 'pass', reason: '原因', extra: true },
      { status: 'pass' },
   ];
   for (const value of invalidReports) {
      assert.throws(() => validateQualityReport(value));
   }

   assert.notEqual(qualityHash({ script: 'one' }), qualityHash({ script: 'two' }));
   assert.equal(
      qualityHash({ title: '原标题', detail: '原题面', script: 'same' }),
      qualityHash({ title: '新标题', detail: '新题面', script: 'same' }),
   );
});

test('only an unchanged script from an approved version can skip AI review', () => {
   assert.equal(canSkipQualityReview('published', 'script', 'script', 'script'), true);
   assert.equal(canSkipQualityReview('ready', 'source', 'extracted', 'extracted'), true);
   assert.equal(canSkipQualityReview('published', 'script', 'script', 'changed'), false);
   assert.equal(canSkipQualityReview('invalid', 'script', 'script', 'script'), false);
   assert.equal(canSkipQualityReview('draft', 'script', 'script', 'script'), false);
   assert.equal(canSkipQualityReview('ready', undefined, null, 'script'), false);
});

test('review diff describes script additions and removals', () => {
   const previous = 'first\nold\nlast\n';
   const current = 'first\nnew\nlast\n';
   const diff = createReviewDiff(previous, current);

   assert.ok(diff);
   assert.match(diff, /--- previous\/script/);
   assert.match(diff, /-old\n\+new/);
   assert.equal(createReviewDiff(previous, previous), undefined);
});

test('only a valid previous rejection or review decision becomes historical context', () => {
   const rejection = { status: 'reject', reason: '提示语不清晰' };
   const needsReview = { status: 'needs_review', reason: '需要人工确认' };

   assert.deepEqual(previousQualityFeedback('rejected', rejection), rejection);
   assert.deepEqual(previousQualityFeedback('needs_review', needsReview), needsReview);
   assert.equal(previousQualityFeedback('passed', { status: 'pass', reason: '已通过' }), undefined);
   assert.equal(previousQualityFeedback('rejected', needsReview), undefined);
   assert.equal(previousQualityFeedback('rejected', { status: 'reject', reason: '' }), undefined);
   assert.equal(previousQualityFeedback('rejected', { safety: { verdict: 'reject' } }), undefined);
});
