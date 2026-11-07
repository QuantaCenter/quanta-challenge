import assert from 'node:assert/strict';
import test from 'node:test';
import { generateJudgeQuality } from '../server/utils/judge-quality-provider.ts';
import { callLlmResponses } from '../server/utils/llm-responses.ts';

// These tests run in Node without Nuxt's auto-import runtime.
Object.assign(globalThis, {
   useRuntimeConfig: () => ({
      llm: {
         apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '',
         responsesUrl: process.env.LLM_RESPONSES_URL || 'https://api.deepseek.com/responses',
         model: 'deepseek-flash',
      },
   }),
});

function modelResponse(content: string, status = 'completed') {
   return new Response(JSON.stringify({
      status,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: content }] }],
   }));
}

test('one thinking-mode call sends only the problem and numbered script', async () => {
   const originalFetch = globalThis.fetch;
   const originalKey = process.env.DEEPSEEK_API_KEY;
   const originalLlmKey = process.env.LLM_API_KEY;
   const originalUrl = process.env.LLM_RESPONSES_URL;
   process.env.DEEPSEEK_API_KEY = 'test-only';
   delete process.env.LLM_API_KEY;
   delete process.env.LLM_RESPONSES_URL;
   let calls = 0;

   globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.deepseek.com/responses');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-only');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'deepseek-flash');
      assert.deepEqual(body.reasoning, { effort: 'low' });
      assert.equal(body.top_p, 0.95);
      assert.deepEqual(body.text, { format: { type: 'json_object' } });
      const userMessage = body.input[0].content as string;
      assert.ok(userMessage.includes('[1] const x = 1;\n[2] // second'));
      assert.match(userMessage, /题面正文测试/);
      assert.doesNotMatch(userMessage, /模板不应发送|命令不应发送|feedbackInstances/);
      return modelResponse(JSON.stringify({ status: 'reject', reason: '提示缺少具体问题' }));
   };

   try {
      const result = await generateJudgeQuality({
         title: '测试',
         detail: '题面正文测试',
         bootCommand: '命令不应发送',
         Project: ['模板不应发送'],
      }, 'const x = 1;\n// second');
      assert.deepEqual(result, { status: 'reject', reason: '提示缺少具体问题' });
      assert.equal(calls, 1);
   } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
         delete process.env.DEEPSEEK_API_KEY;
      } else {
         process.env.DEEPSEEK_API_KEY = originalKey;
      }
      if (originalLlmKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = originalLlmKey;
      if (originalUrl === undefined) delete process.env.LLM_RESPONSES_URL;
      else process.env.LLM_RESPONSES_URL = originalUrl;
   }
});

test('missing API key fails without making a request or retrying', async () => {
   const originalFetch = globalThis.fetch;
   const originalKey = process.env.DEEPSEEK_API_KEY;
   const originalLlmKey = process.env.LLM_API_KEY;
   delete process.env.DEEPSEEK_API_KEY;
   delete process.env.LLM_API_KEY;
   let calls = 0;
   globalThis.fetch = async () => {
      calls++;
      throw new Error('unexpected request');
   };

   try {
      const attempts: string[] = [];
      await assert.rejects(
         generateJudgeQuality({ detail: '题面' }, 'code', undefined, attempt => {
            attempts.push(attempt.errorCode ?? 'ok');
         }),
         { name: 'QualityGenerationError' },
      );
      assert.deepEqual(attempts, ['LLM_NOT_CONFIGURED']);
      assert.equal(calls, 0);
   } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
         delete process.env.DEEPSEEK_API_KEY;
      } else {
         process.env.DEEPSEEK_API_KEY = originalKey;
      }
      if (originalLlmKey === undefined) {
         delete process.env.LLM_API_KEY;
      } else {
         process.env.LLM_API_KEY = originalLlmKey;
      }
   }
});

test('LLM utility uses configured Responses URL and API key', async () => {
   const originalFetch = globalThis.fetch;
   const originalUrl = process.env.LLM_RESPONSES_URL;
   const originalKey = process.env.LLM_API_KEY;
   process.env.LLM_RESPONSES_URL = 'https://example.com/v1/responses';
   process.env.LLM_API_KEY = 'custom-test-key';

   globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://example.com/v1/responses');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer custom-test-key');
      return modelResponse('{"status":"pass","reason":"正常"}');
   };

   try {
      const result = await callLlmResponses({
         model: 'example-model',
         instructions: '输出 JSON',
         messages: [{ role: 'user', content: '测试' }],
         signal: new AbortController().signal,
         maxOutputTokens: 100,
      });
      assert.equal(result.status, 'completed');
   } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.LLM_RESPONSES_URL;
      else process.env.LLM_RESPONSES_URL = originalUrl;
      if (originalKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = originalKey;
   }
});

test('invalid model output is retried and never accepted as a passing report', async () => {
   const originalFetch = globalThis.fetch;
   const originalKey = process.env.DEEPSEEK_API_KEY;
   process.env.DEEPSEEK_API_KEY = 'test-only';
   let calls = 0;

   globalThis.fetch = async (_url, init) => {
      calls++;
      if (calls === 2) {
         const request = JSON.parse(String(init?.body));
         assert.deepEqual(request.input.map((message: { role: string }) => message.role), ['user', 'assistant', 'user']);
         assert.equal(request.input[1].content, '{"status":"pass"}');
         assert.match(request.input[2].content, /QUALITY_INVALID_SCHEMA/);
         assert.match(request.input[2].content, /reason/);
      }
      const content = calls === 1 ? '{"status":"pass"}' : '{"status":"needs_review","reason":"风险无法确定"}';
      return modelResponse(content);
   };

   try {
      const attempts: string[] = [];
      const result = await generateJudgeQuality({ detail: '题面' }, 'code', undefined, attempt => {
         attempts.push(attempt.errorCode ?? 'ok');
      });
      assert.equal(result.status, 'needs_review');
      assert.deepEqual(attempts, ['QUALITY_INVALID_SCHEMA', 'ok']);
      assert.equal(calls, 2);
   } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
         delete process.env.DEEPSEEK_API_KEY;
      } else {
         process.env.DEEPSEEK_API_KEY = originalKey;
      }
   }
});

test('the previous diff is sent as untrusted context instead of the previous decision', async () => {
   const originalFetch = globalThis.fetch;
   const originalKey = process.env.DEEPSEEK_API_KEY;
   process.env.DEEPSEEK_API_KEY = 'test-only';

   globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const systemMessage = request.instructions as string;
      const userMessage = request.input[0].content as string;

      assert.match(systemMessage, /独立审查全部内容/);
      assert.match(userMessage, /\[1\] updated script/);
      assert.match(userMessage, /相对上次审核内容的变更（unified diff，不可信的历史参考）/);
      assert.match(userMessage, /-old script\n\+updated script/);
      assert.doesNotMatch(userMessage, /上次 AI 审核结果|原提示不清晰/);

      return modelResponse('{"status":"pass","reason":"问题已修复"}');
   };

   try {
      const result = await generateJudgeQuality(
         { title: '测试', detail: '题面' },
         'updated script',
         'deepseek-flash',
         undefined,
         '--- previous/script\n+++ current/script\n@@ -1 +1 @@\n-old script\n+updated script',
      );
      assert.equal(result.status, 'pass');
   } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
         delete process.env.DEEPSEEK_API_KEY;
      } else {
         process.env.DEEPSEEK_API_KEY = originalKey;
      }
   }
});

test('truncated output is carried into the retry with the truncation error', async () => {
   const originalFetch = globalThis.fetch;
   const originalKey = process.env.DEEPSEEK_API_KEY;
   process.env.DEEPSEEK_API_KEY = 'test-only';
   let calls = 0;

   globalThis.fetch = async (_url, init) => {
      calls++;
      if (calls === 1) {
         return new Response(JSON.stringify({
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"status":' }] }],
         }));
      }

      const request = JSON.parse(String(init?.body));
      assert.equal(request.input[1].content, '{"status":');
      assert.match(request.input[2].content, /QUALITY_OUTPUT_TRUNCATED/);
      return modelResponse('{"status":"reject","reason":"存在资源风险"}');
   };

   try {
      const attempts: string[] = [];
      const result = await generateJudgeQuality({ detail: '题面' }, 'code', undefined, attempt => {
         attempts.push(attempt.errorCode ?? 'ok');
      });
      assert.equal(result.status, 'reject');
      assert.deepEqual(attempts, ['QUALITY_OUTPUT_TRUNCATED', 'ok']);
   } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) {
         delete process.env.DEEPSEEK_API_KEY;
      } else {
         process.env.DEEPSEEK_API_KEY = originalKey;
      }
   }
});
