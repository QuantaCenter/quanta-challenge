import { describe, expect, it } from 'vitest';
import { CloudFunctionKv, buildScope } from '../services/kv';

describe('KV 隔离域', () => {
   it('用户隔离开启 + 有用户 → u:<userId>', () => {
      expect(
         buildScope({
            functionId: 'f',
            userIsolated: true,
            userId: 'u1',
            keyId: 'web-app',
         }),
      ).toBe('u:u1');
   });

   it('用户隔离开启 + 无用户 → sys:<keyId>', () => {
      expect(
         buildScope({
            functionId: 'f',
            userIsolated: true,
            userId: null,
            keyId: 'judge',
         }),
      ).toBe('sys:judge');
   });

   it('用户隔离关闭 → s（函数级共享）', () => {
      expect(
         buildScope({
            functionId: 'f',
            userIsolated: false,
            userId: 'u1',
            keyId: 'web-app',
         }),
      ).toBe('s');
   });
});

describe('KV key 校验（在触达 Redis 之前就拒绝）', () => {
   const make = () =>
      new CloudFunctionKv({
         functionId: 'f',
         userIsolated: true,
         userId: 'u1',
         keyId: 'web-app',
      });

   it('空 key', async () => {
      await expect(make().get('')).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
   });

   it('超长 key', async () => {
      await expect(make().get('a'.repeat(300))).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
   });

   it('含空格/非法字符的 key', async () => {
      await expect(make().get('bad key')).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
      await expect(make().get('bad*key')).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
   });

   it('keys() 的 pattern 不能以 / 或 : 开头', async () => {
      await expect(make().keys(':evil')).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
      await expect(make().keys('/evil')).rejects.toMatchObject({
         code: 'INVALID_INPUT',
      });
   });
});
