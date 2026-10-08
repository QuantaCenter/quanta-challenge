import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
   CF_HEADER,
   buildCanonicalString,
   generateCloudFunctionHeaders,
   signCloudFunctionRequest,
   timingSafeEqualHex,
   verifyCloudFunctionSignature,
} from '@challenge/shared/cloud-function';

const SECRET = 'test-secret';
const BODY = JSON.stringify({ input: { a: 1 } });

const base = () => ({
   method: 'POST',
   path: '/v1/invoke/demo',
   query: { b: '2', a: '1' },
   body: BODY,
   timestamp: 1_730_000_000_000,
   nonce: 'nonce-123',
   userId: 'user-42',
});

describe('cloud-function 签名', () => {
   it('规范化串按「方法/路径/排序 query/体哈希/时间戳/nonce/用户」拼装', () => {
      const bodyHash = createHash('sha256').update(BODY).digest('hex');
      expect(buildCanonicalString(base())).toBe(
         ['POST', '/v1/invoke/demo', 'a=1&b=2', bodyHash, '1730000000000', 'nonce-123', 'user-42'].join(
            '\n',
         ),
      );
   });

   it('query 顺序不影响签名', () => {
      const first = signCloudFunctionRequest({
         ...base(),
         query: { a: '1', b: '2' },
         secret: SECRET,
      });
      const second = signCloudFunctionRequest({
         ...base(),
         query: { b: '2', a: '1' },
         secret: SECRET,
      });
      expect(first).toBe(second);
   });

   it('正确签名可通过校验', () => {
      const signature = signCloudFunctionRequest({ ...base(), secret: SECRET });
      expect(
         verifyCloudFunctionSignature({ ...base(), secret: SECRET, signature }),
      ).toBe(true);
   });

   it('篡改 body / userId / method 后校验失败', () => {
      const signature = signCloudFunctionRequest({ ...base(), secret: SECRET });

      expect(
         verifyCloudFunctionSignature({
            ...base(),
            body: JSON.stringify({ input: { a: 2 } }),
            secret: SECRET,
            signature,
         }),
      ).toBe(false);

      expect(
         verifyCloudFunctionSignature({
            ...base(),
            userId: 'user-99',
            secret: SECRET,
            signature,
         }),
      ).toBe(false);

      expect(
         verifyCloudFunctionSignature({
            ...base(),
            method: 'GET',
            secret: SECRET,
            signature,
         }),
      ).toBe(false);
   });

   it('错误 secret 校验失败', () => {
      const signature = signCloudFunctionRequest({ ...base(), secret: SECRET });
      expect(
         verifyCloudFunctionSignature({
            ...base(),
            secret: 'other',
            signature,
         }),
      ).toBe(false);
   });

   it('generateCloudFunctionHeaders 生成的请求头可被校验', () => {
      const headers = generateCloudFunctionHeaders({
         method: 'POST',
         path: '/v1/invoke/demo',
         body: BODY,
         keyId: 'web-app',
         secret: SECRET,
         userId: 'user-42',
         timestamp: 1_730_000_000_000,
         nonce: 'nonce-xyz',
      });

      expect(headers[CF_HEADER.keyId]).toBe('web-app');
      expect(headers[CF_HEADER.userId]).toBe('user-42');

      expect(
         verifyCloudFunctionSignature({
            method: 'POST',
            path: '/v1/invoke/demo',
            body: BODY,
            timestamp: headers[CF_HEADER.timestamp]!,
            nonce: headers[CF_HEADER.nonce]!,
            userId: 'user-42',
            secret: SECRET,
            signature: headers[CF_HEADER.signature]!,
         }),
      ).toBe(true);
   });

   it('timingSafeEqualHex 对不等长/非十六进制输入返回 false', () => {
      expect(timingSafeEqualHex('ab', 'abcd')).toBe(false);
      expect(timingSafeEqualHex('zz', 'zz')).toBe(false);
      expect(timingSafeEqualHex('', '')).toBe(false);
   });
});
