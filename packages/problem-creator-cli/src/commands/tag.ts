import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { ConfigError, UsageError } from '../core/errors';
import { applyTagIdsUpdate } from '../domain/config-writer';
import { findConfigFile, loadProblemConfig } from '../domain/problem-config';
import { createAdminApi, type Tag } from '../services/admin-api';
import { readText, writeTextAtomic } from '../utils/fs';
import { displayPath } from '../utils/paths';
import { multiselect } from '../utils/terminal';
import type { CommandRegistry } from './registry';

export interface TagOptions {
   dir: string;
   /** 交互式多选标签并写回配置 */
   write?: boolean;
   /** 直接指定标签 id（逗号或空格分隔），写回配置 */
   set?: string[];
}

export const registerTagCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('tag')
      .description('查看平台标签；--write 交互多选后把 tagIds 写回配置')
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option('--write', '交互式多选标签并写回配置')
      .option('--set <id...>', '直接指定标签 id（逗号或空格分隔），写回配置')
      .action(async (dir: string, options: Omit<TagOptions, 'dir'>) => {
         const ctx = await context();
         await runTag(ctx, { dir, ...options });
      });
};

export const runTag = async (
   ctx: CommandContext,
   options: TagOptions,
): Promise<void> => {
   if (options.write && options.set !== undefined) {
      throw new UsageError('--write 与 --set 不能同时使用', {
         hint: '--write 是交互多选，--set 是直接指定 id，二选一。',
      });
   }

   const api = createAdminApi(ctx.client);
   ctx.logger.step('读取平台标签（public.tag.list）');
   const tags = await api.listTags();

   // 只查看不写回：不需要题目目录，也不需要登录。
   if (!options.write && options.set === undefined) {
      renderTags(ctx, tags);
      if (ctx.logger.json) ctx.logger.result({ tags });
      return;
   }

   if (tags.length === 0) {
      throw new UsageError('平台上还没有标签，无法配置', {
         hint: '先在管理端「标签管理」创建标签，再重跑。',
      });
   }

   const rootDir = resolve(ctx.cwd, options.dir);
   const configFile = await findConfigFile(rootDir);

   const tagIds =
      options.set !== undefined
         ? assertTagsExist(parseTagIds(options.set), tags)
         : await pickTags(ctx, tags, await readCurrentTagIds(configFile));

   const written = await writeBackTagIds(configFile, tagIds);
   ctx.logger.blank();
   renderTags(ctx, tags, new Set(tagIds));
   ctx.logger.success(
      `tagIds 已写回 ${displayPath(ctx.cwd, written)}：[${tagIds.join(', ')}]`,
   );

   if (ctx.logger.json) {
      ctx.logger.result({
         tagIds,
         tags,
         configFile,
      });
   }
};

const renderTags = (
   ctx: CommandContext,
   tags: Tag[],
   selected?: Set<number>,
): void => {
   if (tags.length === 0) {
      ctx.logger.warn('平台上还没有标签');
      return;
   }
   const { colors } = ctx.logger;
   ctx.logger.step(`平台标签（${tags.length} 个）`);
   for (const tag of tags) {
      const mark = selected
         ? selected.has(tag.tid)
            ? colors.green('●')
            : colors.dim('○')
         : colors.dim('·');
      const color = tag.color ? colors.dim(tag.color) : '';
      ctx.logger.info(`  ${mark} #${tag.tid} ${tag.name}  ${color}`);
      if (tag.description) ctx.logger.detail(tag.description);
   }
};

const pickTags = async (
   ctx: CommandContext,
   tags: Tag[],
   current: number[],
): Promise<number[]> => {
   const chosen = await multiselect(
      '选择本题的标签（空格切换，回车确认）',
      tags.map((tag) => ({
         value: String(tag.tid),
         label: `#${tag.tid} ${tag.name}`,
         ...(tag.color ? { hint: tag.color } : {}),
      })),
      {
         stdin: ctx.runtime.stdin,
         stderr: ctx.runtime.stderr,
         stderrStream: ctx.runtime.stderrStream,
      },
      { initialValues: current.map(String), required: true },
   );
   return chosen.map((value) => Number.parseInt(value, 10));
};

// 配置里已有的 tagIds，用于多选预选中；缺 tagIds 的旧配置也能读（不跑 schema）。
const readCurrentTagIds = async (configFile: string): Promise<number[]> => {
   const content = await readText(configFile);
   const match = /\btagIds\s*:\s*\[([^\]]*)\]/.exec(content);
   if (!match) return [];
   return (match[1] ?? '')
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0);
};

const parseTagIds = (values: string[]): number[] => {
   const parts = values
      .flatMap((value) => value.split(','))
      .map((part) => part.trim())
      .filter(Boolean);
   const parsed = parts.map((part) => Number.parseInt(part, 10));
   if (
      parsed.length === 0 ||
      parsed.some((id) => !Number.isInteger(id) || id <= 0)
   ) {
      throw new UsageError(`标签 id 必须是正整数：${parts.join(', ')}`, {
         hint: '运行 `qpc tag` 查看可用 id。',
      });
   }
   return parsed;
};

const assertTagsExist = (tagIds: number[], tags: Tag[]): number[] => {
   const known = new Set(tags.map((tag) => tag.tid));
   const missing = tagIds.filter((id) => !known.has(id));
   if (missing.length > 0) {
      throw new UsageError(`标签不存在：${missing.join(', ')}`, {
         hint: `可用 id：${tags
            .map((tag) => tag.tid)
            .join(', ')}（\`qpc tag\` 看名称）。`,
      });
   }
   return tagIds;
};

// 写完重新加载校验，对不上就回滚（与 problemId / imageId 写回同一套做法）。
const writeBackTagIds = async (
   configFile: string,
   tagIds: number[],
): Promise<string> => {
   const original = await readText(configFile);
   const patched = applyTagIdsUpdate(original, tagIds, configFile);
   await writeTextAtomic(configFile, patched);
   try {
      const reloaded = await loadProblemConfig(resolve(configFile, '..'));
      const same =
         reloaded.tagIds.length === tagIds.length &&
         reloaded.tagIds.every((id, index) => id === tagIds[index]);
      if (!same) throw new Error('写回后读取到的 tagIds 与预期不一致');
   } catch (error) {
      await writeTextAtomic(configFile, original);
      throw new ConfigError('写回 tagIds 后配置校验失败，已回滚原文件', {
         cause: error,
         hint: `手动把 tagIds 填成 [${tagIds.join(', ')}]。`,
      });
   }
   return configFile;
};
