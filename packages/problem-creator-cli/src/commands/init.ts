import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import {
   DEFAULT_INIT_COMMAND,
   DEFAULT_JUDGE_UPLOAD_PATH,
   DIFFICULTIES,
   type Difficulty,
} from '../domain/problem-config';
import { buildProblemScaffold } from '../templates/problem-scaffold';
import { listDir, writeTextWithMode } from '../utils/fs';
import { displayPath } from '../utils/paths';
import type { CommandRegistry } from './registry';

export interface InitOptions {
   name?: string;
   difficulty?: string;
   tag?: string[];
   mount?: string;
   force?: boolean;
}

export const registerInitCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('init')
      .description(
         '生成题目骨架：problem.config.ts / judge.js / template / answer',
      )
      .argument('[dir]', '目标目录（默认当前目录）', '.')
      .option('--name <title>', '题目标题（默认取目录名）')
      .option(
         '--difficulty <level>',
         `难度：${DIFFICULTIES.join(' | ')}`,
         'easy',
      )
      .option('--tag <id...>', '标签 id，可给多个（当前库中 1 = Vue3）', ['1'])
      .option(
         '--mount <path>',
         '判题打包目录 / 快照挂载路径',
         DEFAULT_JUDGE_UPLOAD_PATH,
      )
      .option('--force', '目录非空时仍然写入（只覆盖同名文件，不删除其它文件）')
      .action(async (dir: string, options: InitOptions) => {
         const ctx = await context();
         await runInit(ctx, dir, options);
      });
};

export const runInit = async (
   ctx: CommandContext,
   dir: string,
   options: InitOptions,
): Promise<void> => {
   const target = resolve(ctx.cwd, dir);
   const difficulty = assertDifficulty(options.difficulty);
   const tagIds = assertTagIds(options.tag);
   const mountPath = options.mount ?? DEFAULT_JUDGE_UPLOAD_PATH;

   if (!options.force) {
      const existing = (await listDir(target)).filter(
         (name) => name !== '.git',
      );
      if (existing.length > 0) {
         throw new UsageError(`目录非空：${displayPath(ctx.cwd, target)}`, {
            hint: '换一个空目录，或加 --force 覆盖同名文件（已有文件不会被删除）。',
         });
      }
   }

   const files = buildProblemScaffold({
      title: options.name?.trim() || defaultTitle(target),
      difficulty,
      tagIds,
      mountPath,
      initCommand: DEFAULT_INIT_COMMAND.replace(/\sproject$/, ` ${mountPath}`),
   });

   ctx.logger.step(`生成题目骨架 → ${displayPath(ctx.cwd, target)}`);
   for (const file of files) {
      await writeTextWithMode(resolve(target, file.path), file.content);
      ctx.logger.success(
         `${file.path}  ${ctx.logger.colors.dim(`${file.content.length} 字符`)}`,
      );
   }

   const cd = dir === '.' ? 'qpc' : `cd ${displayPath(ctx.cwd, target)} && qpc`;
   ctx.logger.blank();
   ctx.logger.step('下一步');
   ctx.logger.info(`  ${cd} check          # 毫秒级静态预检`);
   ctx.logger.info(`  ${cd} upload --wait  # 上传并等待审计（约 20 秒）`);

   if (ctx.logger.json) {
      ctx.logger.result({
         dir: target,
         files: files.map((file) => file.path),
         difficulty,
         tagIds,
      });
   }
};

const defaultTitle = (target: string): string =>
   target.split(/[\\/]/).filter(Boolean).pop() ?? '未命名题目';

const assertDifficulty = (value: string | undefined): Difficulty => {
   const candidate = (value ?? 'easy') as Difficulty;
   if (!DIFFICULTIES.includes(candidate)) {
      throw new UsageError(`难度不合法：${value}`, {
         hint: `可选值：${DIFFICULTIES.join(' | ')}`,
      });
   }
   return candidate;
};

const assertTagIds = (values: string[] | undefined): number[] => {
   const list = values && values.length > 0 ? values : ['1'];
   const parts = list.flatMap((value) =>
      value
         .split(',')
         .map((part) => part.trim())
         .filter(Boolean),
   );
   const parsed = parts.map((part) => Number.parseInt(part, 10));
   if (parsed.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new UsageError(`标签 id 必须是正整数：${parts.join(', ')}`, {
         hint: '标签 id 可在管理端「标签管理」页查看；当前库中 1 = Vue3。',
      });
   }
   return parsed;
};
