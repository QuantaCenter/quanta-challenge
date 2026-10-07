import { describe, expect, it } from 'vitest';

import { ConfigError } from '../../src/core/errors';
import {
   findConfigFile,
   loadProblemConfig,
} from '../../src/domain/problem-config';
import { ensureDir, writeText } from '../../src/utils/fs';
import { createTempDir } from '../helpers/harness';

const VALID = (
   extra = '',
): string => `import { defineProblemConfig } from '@challenge/problem-creator-cli';

export default defineProblemConfig({
   title: '测试题目',
   detail: '题面',
   difficulty: 'easy',
   tagIds: [1],
   ${extra}
});
`;

describe('loadProblemConfig', () => {
   it('加载 TS 配置并补齐默认值（runtime / paths / cover）', async () => {
      const dir = await createTempDir();
      await writeText(`${dir}/problem.config.ts`, VALID());

      const config = await loadProblemConfig(dir);

      expect(config.title).toBe('测试题目');
      expect(config.runtime.judgeUploadPath).toBe('project');
      expect(config.runtime.initCommand).toBe('npx serve -l 3000 project');
      expect(config.cover).toEqual({ mode: 'default' });
      expect(config.paths.judge).toBe(`${dir}/judge.js`);
      expect(config.paths.template).toBe(`${dir}/template`);
   });

   it('支持 JSON 配置', async () => {
      const dir = await createTempDir();
      await writeText(
         `${dir}/problem.config.json`,
         JSON.stringify({
            title: 'json 题目',
            detail: '题面',
            difficulty: 'hard',
            tagIds: [2],
         }),
      );
      const config = await loadProblemConfig(dir);
      expect(config.difficulty).toBe('hard');
      expect(config.tagIds).toEqual([2]);
   });

   it('detailFile 会被读取成 detail', async () => {
      const dir = await createTempDir();
      await writeText(
         `${dir}/problem.config.ts`,
         VALID("detailFile: 'statement.md'").replace("detail: '题面',", ''),
      );
      await writeText(`${dir}/statement.md`, '# 长题面');
      const config = await loadProblemConfig(dir);
      expect(config.detail).toBe('# 长题面');
   });

   it('校验失败时给出字段级错误（而不是抛 zod 的原始堆栈）', async () => {
      const dir = await createTempDir();
      await writeText(
         `${dir}/problem.config.ts`,
         VALID("difficulty: 'impossible'"),
      );
      await expect(loadProblemConfig(dir)).rejects.toBeInstanceOf(ConfigError);
      await expect(loadProblemConfig(dir)).rejects.toThrow(/difficulty/);
   });

   it('缺少题面时报错并提示 detail/detailFile', async () => {
      const dir = await createTempDir();
      await writeText(
         `${dir}/problem.config.ts`,
         VALID().replace("detail: '题面',", ''),
      );
      await expect(loadProblemConfig(dir)).rejects.toThrow(/detail/);
   });

   it('找不到配置文件时提示用 init 生成', async () => {
      const dir = await createTempDir();
      await expect(findConfigFile(dir)).rejects.toBeInstanceOf(ConfigError);
      await expect(findConfigFile(dir)).rejects.toThrow(/problem.config.ts/);
   });

   it('配置里的相对路径基于题目目录解析', async () => {
      const dir = await createTempDir();
      await ensureDir(`${dir}/nested`);
      await writeText(
         `${dir}/problem.config.ts`,
         VALID(
            "paths: { template: 'nested/tpl', answer: 'nested/ans', judge: 'nested/j.js' }",
         ),
      );
      const config = await loadProblemConfig(dir);
      expect(config.paths.template).toBe(`${dir}/nested/tpl`);
      expect(config.paths.judge).toBe(`${dir}/nested/j.js`);
   });
});
