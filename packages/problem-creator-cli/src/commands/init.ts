import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import {
   DEFAULT_JUDGE_UPLOAD_PATH,
   DIFFICULTIES,
   type Difficulty,
   PROBLEM_TYPES,
   type ProblemType,
} from '../domain/problem-config';
import { renderCoverPng } from '../services/cover-image';
import { buildProblemScaffold } from '../templates/problem-scaffold';
import { listDir, writeBinary, writeTextWithMode } from '../utils/fs';
import { displayPath, formatBytes } from '../utils/paths';
import { select } from '../utils/terminal';
import type { CommandRegistry } from './registry';

export interface InitOptions {
   name?: string;
   type?: string;
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
         '--type <type>',
         `题型：${PROBLEM_TYPES.join(' | ')}（不传则方向键选择；非交互环境默认 frontend）`,
      )
      .option(
         '--difficulty <level>',
         `难度：${DIFFICULTIES.join(' | ')}`,
         'easy',
      )
      .option('--tag <id...>', '标签 id，可给多个（用 `qpc tag` 查看）', ['1'])
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
   const title = options.name?.trim() || defaultTitle(target);

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

   const type = await resolveProblemType(ctx, options.type);

   const scaffold = await buildProblemScaffold({
      title,
      type,
      difficulty,
      tagIds,
      mountPath,
   });

   ctx.logger.step(
      `生成${type === 'backend_service' ? '后端服务题' : '前端题'}骨架 → ${displayPath(ctx.cwd, target)}`,
   );
   for (const file of scaffold.files) {
      await writeTextWithMode(resolve(target, file.path), file.content);
      ctx.logger.success(
         `${file.path}  ${ctx.logger.colors.dim(`${file.content.length} 字符`)}`,
      );
   }

   // 后端题没有首屏可截图：init 先本地渲染 cover.png，失败不阻断，qpc cover 可重试。
   if (scaffold.cover) {
      const outFile = resolve(target, scaffold.cover.path);
      try {
         const png = await renderCoverPng(scaffold.cover.spec);
         await writeBinary(outFile, png);
         ctx.logger.success(
            `${scaffold.cover.path}  ${ctx.logger.colors.dim(formatBytes(png.byteLength))}`,
         );
      } catch (error) {
         ctx.logger.warn(
            `封面渲染失败（${error instanceof Error ? error.message : String(error)}）：配置里已有 cover.generate，跑 \`qpc cover\` 可重试`,
         );
      }
   }

   const cd = dir === '.' ? 'qpc' : `cd ${displayPath(ctx.cwd, target)} && qpc`;
   ctx.logger.blank();
   ctx.logger.step('下一步');
   ctx.logger.info(
      `  ${cd} agent          # 判题脚本编写手册（前端 / 后端 / Type Schema）`,
   );
   ctx.logger.info(`  ${cd} tag --write <ids>  # 指定标签`);
   if (type === 'backend_service') {
      ctx.logger.info(
         `  ${cd} cover --write  # 后端题必须自定义封面：生成 → 上传 → 写回 imageId`,
      );
   }
   ctx.logger.info(`  ${cd} check          # 基础信息检查 + 本地微判题`);
   ctx.logger.info(`  ${cd} upload --write # 上传审核并写回 problemId`);

   if (ctx.logger.json) {
      ctx.logger.result({
         dir: target,
         type,
         files: scaffold.files.map((file) => file.path),
         cover: scaffold.cover?.path,
         difficulty,
         tagIds,
      });
   }
};

const defaultTitle = (target: string): string =>
   target.split(/[\\/]/).filter(Boolean).pop() ?? '未命名题目';

const assertProblemType = (value: string | undefined): ProblemType => {
   const candidate = (value ?? 'frontend') as ProblemType;
   if (!PROBLEM_TYPES.includes(candidate)) {
      throw new UsageError(`题型不合法：${value}`, {
         hint: `可选值：${PROBLEM_TYPES.join(' | ')}`,
      });
   }
   return candidate;
};

// 未给 --type 时交互选择；CI / 管道 / --json / --yes 下退回 frontend，保持老行为。
const resolveProblemType = async (
   ctx: CommandContext,
   value: string | undefined,
): Promise<ProblemType> => {
   if (value !== undefined) return assertProblemType(value);
   if (ctx.assumeYes || ctx.logger.json || !ctx.runtime.stdin.isTTY) {
      return 'frontend';
   }
   return select<ProblemType>(
      '请选择题型',
      [
         {
            value: 'frontend',
            label: '前端题（frontend）',
            hint: '静态站点，用 Playwright 判题',
         },
         {
            value: 'backend_service',
            label: '后端服务题（backend_service）',
            hint: '常驻进程，用 HTTP 判题，模板含封面图',
         },
      ],
      {
         stdin: ctx.runtime.stdin,
         stderr: ctx.runtime.stderr,
         stderrStream: ctx.runtime.stderrStream,
      },
      { initialValue: 'frontend' },
   );
};

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
         hint: '运行 `qpc tag` 查看可用标签 id，或用 `qpc tag --write` 交互选择。',
      });
   }
   return parsed;
};
