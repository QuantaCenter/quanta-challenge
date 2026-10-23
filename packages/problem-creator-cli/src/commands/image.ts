import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { ConfigError, UsageError } from '../core/errors';
import {
   detailBaseDir,
   findLocalImageRefs,
   type LocalImageRef,
   MAX_IMAGE_BYTES,
   replaceImageRefs,
   STATIC_IMAGE_PREFIX,
   UPLOADABLE_IMAGE_EXTENSIONS,
} from '../domain/detail-images';
import {
   loadProblemConfig,
   type ResolvedProblemConfig,
} from '../domain/problem-config';
import { createAdminApi } from '../services/admin-api';
import { pathExists, readText, writeText, writeTextAtomic } from '../utils/fs';
import { formatBytes } from '../utils/paths';
import type { CommandRegistry } from './registry';
import { requireSession } from './support';

export interface ImageOptions {
   dir: string;
   write?: boolean;
}

interface UploadedEntry {
   file: string;
   url: string;
   imageId: string;
   cached: boolean;
}

/** 上传缓存：同一张图（按内容哈希）不重复上传，重跑 `qpc image` 是幂等的 */
const CACHE_FILE = '.qpc/images.json';

export const registerImageCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('image')
      .description(
         '上传题面图片：不给文件时上传题面里引用的全部本地图片；--write 把地址回写到题面',
      )
      .argument('[files...]', '要上传的图片（默认：题面里引用的本地图片）')
      .option('--dir <dir>', '题目目录（默认当前目录）', '.')
      .option('--write', '把题面里对应的本地路径替换成平台地址')
      .action(async (files: string[], options: ImageOptions) => {
         const ctx = await context();
         await runImage(ctx, files, options);
      });
};

export const runImage = async (
   ctx: CommandContext,
   files: string[],
   options: ImageOptions,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   const needConfig = files.length === 0 || options.write === true;
   const config = needConfig ? await loadProblemConfig(rootDir) : undefined;
   const refs = config
      ? findLocalImageRefs(config.detail, detailBaseDir(config))
      : [];

   const targets =
      files.length > 0
         ? files.map((file) => resolve(ctx.cwd, file))
         : [...new Set(refs.map((ref) => ref.file))];
   if (targets.length === 0) {
      ctx.logger.info('题面里没有引用本地图片，无需上传');
      ctx.logger.detail(
         '在题面写 `![说明](images/xxx.png)` 后再运行；图片可用 `qpc gen-img` 生成。',
      );
      if (ctx.logger.json) ctx.logger.result({ uploaded: [] });
      return;
   }
   for (const file of targets) await assertUploadable(file);

   requireSession(ctx);
   const api = createAdminApi(ctx.client);
   const cacheFile = join(rootDir, CACHE_FILE);
   const cache = await readCache(cacheFile);
   const uploaded: UploadedEntry[] = [];

   ctx.logger.step(`上传 ${targets.length} 张图片（admin.image.upload）`);
   for (const file of targets) {
      const content = await readFile(file);
      const key = `${ctx.env.apiUrl}#${createHash('sha256').update(content).digest('hex')}`;
      const hit = cache[key];
      if (hit) {
         uploaded.push({ file, ...hit, cached: true });
         ctx.logger.success(
            `${relative(ctx.cwd, file)} → ${hit.url}  ${ctx.logger.colors.dim('（已上传过，复用）')}`,
         );
         continue;
      }
      const image = await api.uploadImage({
         content,
         fileName: basename(file),
      });
      const entry = {
         imageId: image.id,
         url: `${STATIC_IMAGE_PREFIX}${image.name}`,
      };
      cache[key] = entry;
      await writeText(cacheFile, `${JSON.stringify(cache, null, 3)}\n`);
      uploaded.push({ file, ...entry, cached: false });
      ctx.logger.success(
         `${relative(ctx.cwd, file)} → ${entry.url}  ${ctx.logger.colors.dim(formatBytes(content.byteLength))}`,
      );
   }

   const mapping = new Map<string, string>();
   for (const ref of refs) {
      const hit = uploaded.find((entry) => entry.file === ref.file);
      if (hit) mapping.set(ref.ref, hit.url);
   }

   let written: string | undefined;
   if (options.write && config) {
      if (mapping.size === 0) {
         ctx.logger.warn('这些图片没有在题面里被引用，无内容可回写');
         ctx.logger.info(
            `  在题面里引用：${uploaded.map((entry) => `![](${entry.url})`).join('  ')}`,
         );
      } else {
         written = await writeBackDetail(config, mapping, refs);
         ctx.logger.success(
            `已把 ${mapping.size} 处图片地址回写到 ${relative(ctx.cwd, written) || written}`,
         );
      }
   } else if (mapping.size > 0) {
      ctx.logger.info('  加 --write 把题面里的本地路径替换成上面的平台地址');
   } else {
      ctx.logger.step('在题面里这样引用');
      for (const entry of uploaded) ctx.logger.info(`  ![](${entry.url})`);
   }

   if (ctx.logger.json) {
      ctx.logger.result({
         uploaded,
         replaced: Object.fromEntries(mapping),
         written,
      });
   }
};

const assertUploadable = async (file: string): Promise<void> => {
   if (!(await pathExists(file))) {
      throw new UsageError(`图片不存在：${file}`, {
         hint: '先用 `qpc gen-img` 生成，或修正题面里的路径。',
      });
   }
   const ext = extname(file).toLowerCase();
   if (!(UPLOADABLE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new UsageError(`不支持的图片格式：${basename(file)}`, {
         hint: `平台只能展示 ${UPLOADABLE_IMAGE_EXTENSIONS.join(' / ')}。`,
      });
   }
   const { size } = await stat(file);
   if (size > MAX_IMAGE_BYTES) {
      throw new UsageError(
         `图片超过 ${formatBytes(MAX_IMAGE_BYTES)}：${basename(file)}（${formatBytes(size)}）`,
         {
            hint: '压缩或缩小尺寸后重试（`qpc gen-img svg --width` 可缩放；GIF 用 `--width` / `--fps` / `--colors` 或缩短时长）。',
         },
      );
   }
};

/** 写回题面（detailFile 或配置里的内联 detail），再加载验证；对不上就回滚。 */
const writeBackDetail = async (
   config: ResolvedProblemConfig,
   mapping: Map<string, string>,
   refs: LocalImageRef[],
): Promise<string> => {
   const target = config.detailFile
      ? resolve(config.rootDir, config.detailFile)
      : config.configFile;
   const original = await readText(target);
   const patched = replaceImageRefs(original, mapping);
   if (patched === original) {
      throw new ConfigError(`没能在 ${target} 里定位到图片引用，未修改`, {
         hint: `手动替换：${[...mapping].map(([ref, url]) => `${ref} → ${url}`).join('，')}`,
      });
   }
   await writeTextAtomic(target, patched);
   try {
      const reloaded = await loadProblemConfig(config.rootDir);
      const remaining = findLocalImageRefs(
         reloaded.detail,
         detailBaseDir(reloaded),
      ).filter((ref) => mapping.has(ref.ref));
      if (remaining.length > 0) {
         throw new Error(
            `仍有本地引用：${remaining.map((ref) => ref.ref).join(', ')}`,
         );
      }
   } catch (error) {
      await writeTextAtomic(target, original);
      throw new ConfigError('回写题面后校验失败，已回滚原文件', {
         cause: error,
         hint: `手动替换：${refs
            .filter((ref) => mapping.has(ref.ref))
            .map((ref) => `${ref.ref} → ${mapping.get(ref.ref)}`)
            .join('，')}`,
      });
   }
   return target;
};

const readCache = async (
   file: string,
): Promise<Record<string, { imageId: string; url: string }>> => {
   try {
      return JSON.parse(await readFile(file, 'utf8'));
   } catch {
      return {};
   }
};
