import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createTestContext, seedCredentials } from '../helpers/harness';

const CONFIG_DIR = join(tmpdir(), 'qpc-test-context');

/**
 * 地址优先级：--api > QUANTA_API_URL > 凭据文件里的 apiUrl > 默认值。
 *
 * 回归用例：凭据文件记住的是上次登录的地址（往往是 localhost），
 * 它**不能**压过显式设置的 QUANTA_API_URL，否则会出现
 * "设了生产地址却一直连本地"这种很难排查的问题。
 */
describe('Web 应用地址优先级', () => {
   it('QUANTA_API_URL 压过凭据文件里记住的地址', async () => {
      await seedCredentials(CONFIG_DIR);

      const { ctx } = await createTestContext({
         env: {
            QUANTA_CONFIG_DIR: CONFIG_DIR,
            QUANTA_API_URL: 'https://challenge.quantacenter.com',
         },
      });

      expect(ctx.env.apiUrl).toBe('https://challenge.quantacenter.com');
      expect(ctx.client.baseUrl).toBe('https://challenge.quantacenter.com');
   });

   it('--api 压过 QUANTA_API_URL', async () => {
      await seedCredentials(CONFIG_DIR);

      const { ctx } = await createTestContext({
         env: {
            QUANTA_CONFIG_DIR: CONFIG_DIR,
            QUANTA_API_URL: 'https://from-env.example',
         },
         globals: { api: 'https://from-cli.example' },
      });

      expect(ctx.client.baseUrl).toBe('https://from-cli.example');
   });

   it('都没有时回落到凭据文件里的地址', async () => {
      await seedCredentials(CONFIG_DIR);

      const { ctx } = await createTestContext({
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
      });

      expect(ctx.client.baseUrl).toBe('http://localhost:3000');
   });

   it('末尾斜杠被统一去掉', async () => {
      const { ctx } = await createTestContext({
         env: {
            QUANTA_CONFIG_DIR: join(tmpdir(), 'qpc-test-context-slash'),
            QUANTA_API_URL: 'https://example.com/',
         },
      });

      expect(ctx.env.apiUrl).toBe('https://example.com');
   });
});
