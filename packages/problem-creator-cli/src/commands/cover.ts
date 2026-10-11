import { basename, relative, resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { ConfigError, UsageError } from '../core/errors';
import { applyCoverImageId } from '../domain/config-writer';
import {
   assertHexColor,
   COVER_DEFAULTS,
   COVER_SUGGESTED_BG_TO,
   type CoverSpec,
} from '../domain/cover';
import { loadProblemConfig } from '../domain/problem-config';
import { createAdminApi } from '../services/admin-api';
import { renderCoverPng } from '../services/cover-image';
import { readText, writeBinary, writeText } from '../utils/fs';
import { formatBytes } from '../utils/paths';
import type { CommandRegistry } from './registry';
import { requireSession } from './support';

export interface CoverOptions {
   dir: string;
   out?: string;
   bg?: string;
   bgTo?: string;
   accent?: string;
   text?: string;
   subtitle?: string;
   footer?: string;
   width?: string;
   height?: string;
   upload?: boolean;
   write?: boolean;
}

export const registerCoverCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('cover')
      .description('从题目配置一键生成封面图（可选上传并写回 imageId）')
      .argument('[dir]', '题目目录（默认当前目录）', '.')
      .option('--out <file>', '输出文件（默认取配置里的 cover.generate.out）')
      .option('--bg <color>', `背景色，默认 ${COVER_DEFAULTS.bg}`)
      .option(
         '--bg-to <color>',
         `渐变终止色（给了就画渐变），推荐 ${COVER_SUGGESTED_BG_TO}`,
      )
      .option('--accent <color>', `强调色，默认 ${COVER_DEFAULTS.accent}`)
      .option('--text <color>', `主标题颜色，默认 ${COVER_DEFAULTS.text}`)
      .option('--subtitle <text>', '副标题（留空则不渲染）')
      .option('--footer <text>', `左下角页脚，默认 ${COVER_DEFAULTS.footer}`)
      .option('--width <px>', `画布宽度，默认 ${COVER_DEFAULTS.width}`)
      .option('--height <px>', `画布高度，默认 ${COVER_DEFAULTS.height}`)
      .option(
         '--upload',
         '生成后上传到题目平台，输出可用于 cover.imageId 的 id',
      )
      .option('--write', '把上传得到的 imageId 写回题目配置（隐含 --upload）')
      .action(async (dir: string, options: Omit<CoverOptions, 'dir'>) => {
         const ctx = await context();
         await runCover(ctx, { dir, ...options });
      });
};

export const runCover = async (
   ctx: CommandContext,
   options: CoverOptions,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   const config = await loadProblemConfig(rootDir);

   if (config.cover.mode !== 'custom') {
      throw new ConfigError(
         '当前题目用的是「首屏截图」封面，不需要也不应该生成封面图',
         {
            hint: "改成 cover: { mode: 'custom', generate: { ... } } 再跑 `qpc cover`。",
         },
      );
   }

   const generate = config.cover.generate;
   const outFile = resolve(
      rootDir,
      options.out ?? generate?.out ?? 'cover.png',
   );
   const spec = resolveSpec(config.title, generate, options);

   ctx.logger.step(`渲染封面 → ${relative(ctx.cwd, outFile) || outFile}`);
   const png = await renderCoverPng(spec);
   try {
      await writeBinary(outFile, png);
   } catch (error) {
      throw new ConfigError(`无法写入封面文件：${outFile}`, { cause: error });
   }

   ctx.logger.table([
      ['标题', spec.title],
      ['副标题', spec.subtitle || '<无>'],
      ['尺寸', `${spec.width} × ${spec.height}`],
      [
         '配色',
         `${spec.bg}${spec.bgTo ? ` → ${spec.bgTo}` : ''} / ${spec.accent}`,
      ],
      ['文件', `${outFile}（${formatBytes(png.byteLength)}）`],
   ]);
   ctx.logger.success('封面已生成');

   const shouldUpload = options.upload === true || options.write === true;
   if (!shouldUpload) {
      if (!generate) {
         ctx.logger.info(
            '  提示：把这份配色写进 problem.config.ts 的 cover.generate，以后就能用一条 `qpc cover --upload --write` 复现。',
         );
      }
      if (ctx.logger.json) {
         ctx.logger.result({ out: outFile, bytes: png.byteLength, spec });
      }
      return;
   }

   requireSession(ctx);
   const api = createAdminApi(ctx.client);
   ctx.logger.step('上传封面（admin.image.upload）');
   const image = await api.uploadImage({
      fileBase64: png.toString('base64'),
      fileName: basename(outFile),
   });
   ctx.logger.success(`封面已上传：${image.id}`);

   if (options.write) {
      const written = await writeBackImageId(ctx, config.configFile, image.id);
      ctx.logger.success(
         `imageId 已写回 ${relative(ctx.cwd, written) || written}`,
      );
   } else {
      ctx.logger.info(
         `  把它填进配置：cover: { mode: 'custom', imageId: '${image.id}' }（或加 --write 自动写回）`,
      );
   }

   if (ctx.logger.json) {
      ctx.logger.result({
         out: outFile,
         bytes: png.byteLength,
         imageId: image.id,
         imageName: image.name,
         spec,
         configFile: options.write ? config.configFile : undefined,
      });
   }
};

/**
 * 写回之后**重新加载一次配置**验证。
 *
 * 文本手术总有翻车的可能（用户写得足够奇怪就匹配不到），而写坏的配置文件
 * 比没写更糟。验证失败就回滚，把"改坏了"变成"没改"。
 */
const writeBackImageId = async (
   ctx: CommandContext,
   configFile: string,
   imageId: string,
): Promise<string> => {
   const original = await readText(configFile);
   const patched = applyCoverImageId(original, imageId, configFile);
   await writeText(configFile, patched);
   try {
      const reloaded = await loadProblemConfig(resolve(configFile, '..'));
      if (
         reloaded.cover.mode !== 'custom' ||
         reloaded.cover.imageId !== imageId
      ) {
         throw new Error('写回后读取到的 imageId 与预期不一致');
      }
   } catch (error) {
      await writeText(configFile, original);
      throw new ConfigError('写回 imageId 后配置校验失败，已回滚原文件', {
         cause: error,
         hint: `手动把 imageId 填成 ${imageId}。`,
      });
   }
   ctx.logger.detail(`cover.imageId = ${imageId}`);
   return configFile;
};

const resolveSpec = (
   title: string,
   generate: (Partial<CoverSpec> & { out?: string }) | undefined,
   options: CoverOptions,
): CoverSpec => {
   const pick = (flag: string | undefined, fromConfig: string | undefined) =>
      flag ?? fromConfig;

   const color = (
      value: string | undefined,
      fallback: string,
      field: string,
   ): string => assertHexColor(value ?? fallback, field);

   return {
      title,
      subtitle: pick(options.subtitle, generate?.subtitle),
      footer: pick(options.footer, generate?.footer),
      bg: color(pick(options.bg, generate?.bg), COVER_DEFAULTS.bg, '--bg'),
      bgTo:
         pick(options.bgTo, generate?.bgTo) === undefined
            ? undefined
            : color(
                 pick(options.bgTo, generate?.bgTo),
                 COVER_DEFAULTS.bg,
                 '--bg-to',
              ),
      accent: color(
         pick(options.accent, generate?.accent),
         COVER_DEFAULTS.accent,
         '--accent',
      ),
      text: color(
         pick(options.text, generate?.text),
         COVER_DEFAULTS.text,
         '--text',
      ),
      width: parseSize(
         options.width,
         generate?.width,
         COVER_DEFAULTS.width,
         '--width',
      ),
      height: parseSize(
         options.height,
         generate?.height,
         COVER_DEFAULTS.height,
         '--height',
      ),
   };
};

const parseSize = (
   flag: string | undefined,
   fromConfig: number | undefined,
   fallback: number,
   field: string,
): number => {
   if (flag === undefined) return fromConfig ?? fallback;
   const value = Number.parseInt(flag, 10);
   if (!Number.isFinite(value) || value < 200 || value > 4096) {
      throw new UsageError(`${field} 必须是 200~4096 之间的整数：${flag}`);
   }
   return value;
};
