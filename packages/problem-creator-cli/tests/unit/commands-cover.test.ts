import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCover } from '../../src/commands/cover';
import { ConfigError, UsageError } from '../../src/core/errors';
import { loadProblemConfig } from '../../src/domain/problem-config';
import { pathExists, readText, writeText } from '../../src/utils/fs';
import { createFakeApi, trpcOk } from '../helpers/fake-api';
import {
   createTempDir,
   createTestContext,
   seedCredentials,
} from '../helpers/harness';

const CONFIG_DIR = join(tmpdir(), 'qpc-test-cover');

const configSource = (cover: string): string => `export default {
   title: '购物车合计',
   detail: '示例题面',
   difficulty: 'easy',
   tagIds: [1],
   cover: ${cover},
   runtime: { judgeUploadPath: 'project', initCommand: 'npx serve -l 3000 project' },
};
`;

const setupProblem = async (cover: string): Promise<string> => {
   const dir = await createTempDir();
   await writeText(join(dir, 'problem.config.ts'), configSource(cover));
   return dir;
};

const setup = async (
   dir: string,
   fetch: ReturnType<typeof createFakeApi>['fetch'],
) => {
   await seedCredentials(CONFIG_DIR);
   return createTestContext({
      cwd: dir,
      env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
      fetch,
   });
};

describe('qpc cover', () => {
   it('只生成：写出 PNG，不发任何请求', async () => {
      const dir = await setupProblem(
         "{ mode: 'custom', generate: { bg: '#101828', bgTo: '#123B2A' } }",
      );
      const api = createFakeApi({});
      const { ctx, harness } = await setup(dir, api.fetch);

      await runCover(ctx, { dir: '.' });

      expect(api.requests).toHaveLength(0);
      const cover = join(dir, 'cover.png');
      expect(await pathExists(cover)).toBe(true);
      // PNG 魔数：确认写的是二进制而不是被 utf8 编码过的文本
      const bytes = await readFile(cover);
      expect(bytes.subarray(0, 4).toString('binary')).toBe('\x89PNG');
      expect(harness.out()).toContain('封面已生成');
   });

   it('命令行参数覆盖配置里的配色', async () => {
      const dir = await setupProblem(
         "{ mode: 'custom', generate: { bg: '#101828' } }",
      );
      const api = createFakeApi({});
      const { ctx, harness } = await setup(dir, api.fetch);

      await runCover(ctx, { dir: '.', bg: '#FF0000', width: '600' });

      expect(harness.out()).toContain('#FF0000');
      expect(harness.out()).toContain('600 × 675');
   });

   it('--upload 上传后返回 imageId，不动配置文件', async () => {
      const dir = await setupProblem("{ mode: 'custom', generate: {} }");
      const api = createFakeApi({
         'POST /api/trpc/admin.image.upload': () =>
            trpcOk({ id: 'img-1', name: 'img-1.png' }),
      });
      const { ctx } = await setup(dir, api.fetch);

      await runCover(ctx, { dir: '.', upload: true });

      const body = api.requests[0]?.body as Record<string, string>;
      expect(body.fileName).toBe('cover.png');
      expect(
         Buffer.from(body.fileBase64 ?? '', 'base64').length,
      ).toBeGreaterThan(1000);
      expect(await readText(join(dir, 'problem.config.ts'))).not.toContain(
         'imageId',
      );
   });

   it('--write 把 imageId 写回配置，且写回后可正常加载', async () => {
      const dir = await setupProblem("{ mode: 'custom', generate: {} }");
      const api = createFakeApi({
         'POST /api/trpc/admin.image.upload': () =>
            trpcOk({ id: 'img-1', name: 'img-1.png' }),
      });
      const { ctx } = await setup(dir, api.fetch);

      await runCover(ctx, { dir: '.', write: true });

      const written = await readText(join(dir, 'problem.config.ts'));
      expect(written).toContain("imageId: 'img-1'");
      const reloaded = await loadProblemConfig(dir);
      expect(reloaded.cover.mode).toBe('custom');
      expect(reloaded.cover.mode === 'custom' && reloaded.cover.imageId).toBe(
         'img-1',
      );
   });

   it('再次 --write 会替换旧的 imageId 而不是追加一个', async () => {
      const dir = await setupProblem(
         "{ mode: 'custom', imageId: 'old-id', generate: {} }",
      );
      const api = createFakeApi({
         'POST /api/trpc/admin.image.upload': () =>
            trpcOk({ id: 'new-id', name: 'new-id.png' }),
      });
      const { ctx } = await setup(dir, api.fetch);

      await runCover(ctx, { dir: '.', write: true });

      const written = await readText(join(dir, 'problem.config.ts'));
      expect(written).toContain("imageId: 'new-id'");
      expect(written).not.toContain('old-id');
   });

   it('封面是首屏截图时拒绝生成（那是另一条链路）', async () => {
      const dir = await setupProblem("{ mode: 'default' }");
      const api = createFakeApi({});
      const { ctx } = await setup(dir, api.fetch);

      await expect(runCover(ctx, { dir: '.' })).rejects.toThrow(ConfigError);
   });

   it('非法颜色是用法错误，不是运行时错误', async () => {
      const dir = await setupProblem("{ mode: 'custom', generate: {} }");
      const api = createFakeApi({});
      const { ctx } = await setup(dir, api.fetch);

      await expect(runCover(ctx, { dir: '.', bg: 'red' })).rejects.toThrow(
         UsageError,
      );
   });
});
