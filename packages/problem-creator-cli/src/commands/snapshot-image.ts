import { resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { ConfigError, UsageError } from '../core/errors';
import { applySnapshotImageIdUpdate } from '../domain/config-writer';
import { findConfigFile, loadProblemConfig } from '../domain/problem-config';
import { SNAPSHOT_IMAGE_ID_PATTERN } from '../domain/problem-config-schema';
import { createAdminApi, type SnapshotImage } from '../services/admin-api';
import { readText, writeTextAtomic } from '../utils/fs';
import { displayPath, formatBytes } from '../utils/paths';
import { select } from '../utils/terminal';
import type { CommandRegistry } from './registry';
import { requireSession } from './support';

export interface SnapshotImageOptions {
   dir: string;
   /** 写回配置：不带值时交互单选，带 id 时直接写入（等同 --set） */
   write?: boolean | string;
   /** 直接指定快照镜像 id（`none` 表示不使用），写回配置 */
   set?: string;
}

/** `--set none`：写入 null，追加版本时解绑平台上的快照镜像 */
const NONE = 'none';

export const registerSnapshotImageCommand = (
   registry: CommandRegistry,
): void => {
   const { program, context } = registry;

   program
      .command('snapshot-image')
      .description(
         '查看平台快照镜像（做题页 Vivari 挂载）；--write 把 snapshotImageId 写回配置（不带 id 交互单选，带 id 直接写入）',
      )
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option(
         '--write [id]',
         '写回配置：`--write` 交互单选；`--write <id>` 直接写入；`--write none` 不使用快照镜像',
      )
      .option('--set <id>', '直接指定快照镜像 id（none 表示不使用），写回配置')
      .action(
         async (dir: string, options: Omit<SnapshotImageOptions, 'dir'>) => {
            const ctx = await context();
            await runSnapshotImage(ctx, { dir, ...options });
         },
      );
};

export const runSnapshotImage = async (
   ctx: CommandContext,
   rawOptions: SnapshotImageOptions,
): Promise<void> => {
   if (rawOptions.write && rawOptions.set !== undefined) {
      throw new UsageError('--write 与 --set 不能同时使用', {
         hint: '`--write <id>` 与 `--set <id>` 等价，二选一。',
      });
   }
   const options: SnapshotImageOptions =
      typeof rawOptions.write === 'string'
         ? { ...rawOptions, write: undefined, set: rawOptions.write }
         : rawOptions;

   requireSession(ctx);
   const api = createAdminApi(ctx.client);
   ctx.logger.step('读取平台快照镜像（admin.imageBuild.list）');
   const images = await api.listSnapshotImages();

   const rootDir = resolve(ctx.cwd, options.dir);

   // 只查看：在题目目录里顺带标出配置当前选的是哪个。
   if (!options.write && options.set === undefined) {
      const current = await readCurrentSnapshotImageId(rootDir).catch(
         () => undefined,
      );
      renderImages(ctx, images, current);
      if (ctx.logger.json) {
         ctx.logger.result({ snapshotImages: images, current });
      }
      return;
   }

   const configFile = await findConfigFile(rootDir);
   const snapshotImageId =
      options.set !== undefined
         ? assertSelectable(options.set, images)
         : await pickImage(
              ctx,
              images,
              await readCurrentSnapshotImageId(rootDir),
           );

   const written = await writeBackSnapshotImageId(configFile, snapshotImageId);
   ctx.logger.blank();
   renderImages(ctx, images, snapshotImageId);
   const chosen = images.find((image) => image.id === snapshotImageId);
   ctx.logger.success(
      snapshotImageId === null
         ? `snapshotImageId 已写回 ${displayPath(ctx.cwd, written)}：null（不使用快照镜像）`
         : `snapshotImageId 已写回 ${displayPath(ctx.cwd, written)}：'${snapshotImageId}'（${chosen?.name ?? '未知'}）`,
   );
   ctx.logger.info(
      '  下次 `qpc upload` 生效；已发布的题只改快照镜像时直接更新，不重新审核',
   );

   if (ctx.logger.json) {
      ctx.logger.result({
         snapshotImageId,
         snapshotImages: images,
         configFile,
      });
   }
};

const renderImages = (
   ctx: CommandContext,
   images: SnapshotImage[],
   selected?: string | null,
): void => {
   const { colors } = ctx.logger;
   if (images.length === 0) {
      ctx.logger.warn('平台上还没有快照镜像');
   } else {
      ctx.logger.step(`平台快照镜像（${images.length} 个）`);
      for (const image of images) {
         const ready = image.status === 'ready' && image.formatVersion === 1;
         const mark =
            selected === undefined
               ? colors.dim('·')
               : image.id === selected
                 ? colors.green('●')
                 : colors.dim('○');
         const facts = [
            ready
               ? undefined
               : colors.yellow(
                    image.status === 'ready'
                       ? '旧格式，需重建'
                       : '构建中，不可选',
                 ),
            (image.compressedSizeBytes ?? image.sizeBytes)
               ? formatBytes(image.compressedSizeBytes ?? image.sizeBytes ?? 0)
               : undefined,
            image.referenceCount > 0
               ? `${image.referenceCount} 道题在用`
               : undefined,
         ].filter(Boolean);
         const name = ready ? image.name : colors.dim(image.name);
         ctx.logger.info(
            `  ${mark} ${image.id}  ${name}  ${colors.dim(facts.join(' · '))}`,
         );
         if (image.description) {
            ctx.logger.info(`      ${colors.dim(image.description)}`);
         }
      }
   }
   if (selected === null) {
      ctx.logger.info(`  ${colors.green('●')} 不使用快照镜像`);
   }
};

const pickImage = async (
   ctx: CommandContext,
   images: SnapshotImage[],
   current: string | null | undefined,
): Promise<string | null> => {
   const ready = images.filter(
      (image) => image.status === 'ready' && image.formatVersion === 1,
   );
   const choice = await select(
      '选择本题的快照镜像（方向键选择，回车确认）',
      [
         ...ready.map((image) => ({
            value: image.id,
            label: image.name,
            hint: [
               image.id,
               image.referenceCount > 0
                  ? `${image.referenceCount} 道题在用`
                  : undefined,
            ]
               .filter(Boolean)
               .join(' · '),
         })),
         { value: NONE, label: '不使用快照镜像' },
      ],
      {
         stdin: ctx.runtime.stdin,
         stderr: ctx.runtime.stderr,
         stderrStream: ctx.runtime.stderrStream,
      },
      {
         initialValue:
            current === null
               ? NONE
               : ready.some((image) => image.id === current)
                 ? (current as string)
                 : undefined,
         nonInteractiveHint:
            '直接给 id：`qpc snapshot-image --write <id>`（不使用写 `none`）。',
      },
   );
   return choice === NONE ? null : choice;
};

const assertSelectable = (
   value: string,
   images: SnapshotImage[],
): string | null => {
   const id = value.trim();
   if (id === NONE) return null;
   if (!SNAPSHOT_IMAGE_ID_PATTERN.test(id)) {
      throw new UsageError(`快照镜像 id 不合法：${id}`, {
         hint: '运行 `qpc snapshot-image` 查看可用 id；不使用快照镜像写 `none`。',
      });
   }
   const image = images.find((item) => item.id === id);
   if (!image) {
      throw new UsageError(`快照镜像不存在：${id}`, {
         hint: '运行 `qpc snapshot-image` 查看可用 id；不使用快照镜像写 `none`。',
      });
   }
   if (image.status !== 'ready') {
      throw new UsageError(`快照镜像「${image.name}」还在构建中，暂不可用`, {
         hint: '等管理端「快照镜像」里状态变成就绪后重跑。',
      });
   }
   if (image.formatVersion !== 1) {
      throw new UsageError(
         `快照镜像「${image.name}」仍是旧格式，需管理员使用 Vivari 重建`,
      );
   }
   return id;
};

// 配置里当前的值（用于预选中 / 标记）；不跑 schema，配置有别的错误时也能用。
const readCurrentSnapshotImageId = async (
   rootDir: string,
): Promise<string | null | undefined> => {
   const content = await readText(await findConfigFile(rootDir));
   const match =
      /\bsnapshotImageId\s*["']?\s*:\s*(?:(['"`])([^'"`]*)\1|null)/.exec(
         content,
      );
   if (!match) return undefined;
   return match[1] === undefined ? null : (match[2] ?? null);
};

// 写完重新加载校验，对不上就回滚（与 tagIds / problemId 写回同一套做法）。
const writeBackSnapshotImageId = async (
   configFile: string,
   snapshotImageId: string | null,
): Promise<string> => {
   const original = await readText(configFile);
   const patched = applySnapshotImageIdUpdate(
      original,
      snapshotImageId,
      configFile,
   );
   await writeTextAtomic(configFile, patched);
   try {
      const reloaded = await loadProblemConfig(resolve(configFile, '..'));
      if (reloaded.snapshotImageId !== snapshotImageId) {
         throw new Error('写回后读取到的 snapshotImageId 与预期不一致');
      }
   } catch (error) {
      await writeTextAtomic(configFile, original);
      throw new ConfigError(
         '写回 snapshotImageId 后配置校验失败，已回滚原文件',
         {
            cause: error,
            hint: `手动把 snapshotImageId 填成 ${snapshotImageId === null ? 'null' : `'${snapshotImageId}'`}。`,
         },
      );
   }
   return configFile;
};
