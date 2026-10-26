import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticate, unauthorized } from '../src/security/bearer-auth';
import { boundedJson, redactText, redactValue } from '../src/security/redaction';

test('Bearer token 使用调用方映射并拒绝错误 token', () => {
  const tokens = new Map([['cursor', 'correct-secret']]);
  assert.equal(authenticate(undefined, tokens), undefined);
  assert.equal(authenticate('Bearer wrong-secret', tokens), undefined);
  assert.equal(authenticate('Bearer correct-secret', tokens)?.clientId, 'cursor');
});

test('未授权响应符合 Bearer 认证约定', async () => {
  const response = unauthorized();
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate') ?? '', /^Bearer /);
  assert.equal((await response.json()).error, 'invalid_token');
});

test('日志和结构化结果会脱敏', () => {
  assert.equal(redactText('Authorization: Bearer abcdefghijklmnop'), 'Authorization: Bearer [REDACTED]');
  assert.deepEqual(
    redactValue({ accessToken: 'secret', nested: { password: 'hunter2', safe: 'ok' } }),
    { accessToken: '[REDACTED]', nested: { password: '[REDACTED]', safe: 'ok' } },
  );
});

test('结果体积有硬限制', () => {
  const result = boundedJson({ value: 'x'.repeat(10_000) }, 1_024);
  assert.ok(Buffer.byteLength(result) <= 1_024);
  assert.match(result, /截断/);
});
