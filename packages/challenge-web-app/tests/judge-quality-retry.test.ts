import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyReviewError, QualityGenerationError, withQualityRetries } from '../server/utils/judge-quality-retry.ts';

const sleepWithoutDelay = async () => {};

test('invalid object retries with previous response and validator failure until valid', async () => {
   let calls = 0;
   const entries: unknown[] = [];

   const result = await withQualityRetries(async (context) => {
      calls++;
      if (calls === 1) {
         throw Object.assign(new Error(), {
            name: 'AI_NoObjectGeneratedError',
            text: 'bad JSON',
            finishReason: 'stop',
         });
      }
      if (calls === 2) {
         assert.equal(context.previous?.text, 'bad JSON');
         throw Object.assign(new Error('invalid schema'), { name: 'ZodError' });
      }
      assert.equal(context.previous?.code, 'QUALITY_INVALID_SCHEMA');
      return 'validated';
   }, {
      sleep: sleepWithoutDelay,
      onAttempt: entry => entries.push(entry),
   });

   assert.equal(result, 'validated');
   assert.equal(calls, 3);
   assert.equal(entries.length, 3);
});

test('auth failures are terminal, never repeatedly charge or hide errors', async () => {
   let calls = 0;
   await assert.rejects(
      withQualityRetries(async () => {
         calls++;
         throw { statusCode: 401 };
      }, { sleep: sleepWithoutDelay }),
      error => error instanceof QualityGenerationError && error.attempts[0]?.errorCode === 'QUALITY_AUTH_FAILED',
   );
   assert.equal(calls, 1);
});
test('permanent bad requests and oversized inputs do not retry', () => {
   assert.equal(classifyReviewError({ statusCode: 400 }).retry, false);
   assert.equal(classifyReviewError(new Error('QUALITY_INPUT_TOO_LARGE')).retry, false);
});

test('truncation is distinguished from JSON and schema failures', () => {
   assert.equal(classifyReviewError({ name: 'AI_NoObjectGeneratedError', finishReason: 'length' }).code, 'QUALITY_OUTPUT_TRUNCATED');
   assert.equal(classifyReviewError({ name: 'ZodError' }).code, 'QUALITY_INVALID_SCHEMA');
   assert.equal(classifyReviewError({ statusCode: 429 }).code, 'QUALITY_RATE_LIMITED');
});

test('retries use exponential backoff and stop after three failed attempts', async () => {
   const delays: number[] = [];
   await assert.rejects(
      withQualityRetries(async () => {
         throw { statusCode: 503 };
      }, {
         sleep: async milliseconds => { delays.push(milliseconds); },
      }),
      error => error instanceof QualityGenerationError && error.attempts.length === 3,
   );
   assert.deepEqual(delays, [1000, 2000]);
});

test('deadline prevents further calls and raw responses are absent from final errors', async () => {
   const controller = new AbortController();
   let calls = 0;

   await assert.rejects(
      withQualityRetries(async () => {
         calls++;
         throw Object.assign(new Error('secret'), { name: 'AI_NoObjectGeneratedError', text: 'secret source' });
      }, {
         signal: controller.signal,
         sleep: async () => { controller.abort(); },
      }),
      error => error instanceof QualityGenerationError && !JSON.stringify(error).includes('secret'),
   );
   assert.equal(calls, 1);
});
