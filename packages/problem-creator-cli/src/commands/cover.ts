import { basename, relative, resolve } from 'node:path';

import type { CommandContext } from '../core/context';
import { ConfigError, UsageError } from '../core/errors';
import { applyCoverUpdate } from '../domain/config-writer';
import {
   assertHexColor,
   COVER_DEFAULTS,
   COVER_SUGGESTED_BG_TO,
   type CoverSpec,
} from '../domain/cover';
import {
   type CoverPalette,
   describePaletteProblem,
   randomCoverPalette,
} from '../domain/cover-palette';
import { loadProblemConfig } from '../domain/problem-config';
import { createAdminApi } from '../services/admin-api';
import { renderCoverPng } from '../services/cover-image';
import { readText, writeBinary, writeTextAtomic } from '../utils/fs';
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
   random?: boolean;
   seed?: string;
   upload?: boolean;
   write?: boolean;
}

export const registerCoverCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('cover')
      .description('生成封面图（可上传、写回配置）')
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
      .option('--random', '随机生成一套合理配色（可复现）')
      .option('--seed <n>', '配合 --random：固定种子')
      .option('--upload', '上传封面，输出 imageId')
      .option('--write', '把 imageId 与配色写回配置（隐含 --upload）')
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
   const randomized = resolveRandom(options);
   const spec = resolveSpec(
      config.title,
      generate,
      options,
      randomized?.palette,
   );

   // --random 的承诺是「输出一定可读」。整组生成的配色已逐项校验，但显式颜色
   // 参数优先级更高、可能把它覆盖坏，所以要对最终配色再验一次。
   if (randomized) {
      const problem = describePaletteProblem({
         bg: spec.bg,
         bgTo: spec.bgTo,
         accent: spec.accent,
         text: spec.text,
      });
      if (problem) {
         throw new UsageError(`随机配色与显式颜色参数冲突：${problem}`, {
            hint: '去掉颜色参数让 --random 整组生成，或整组手动指定。',
         });
      }
   }

   // 随机配色只在 --write 时落盘；--upload 不写配置。
   const colors: CoverPalette | undefined = randomized
      ? {
           bg: spec.bg,
           bgTo: spec.bgTo,
           accent: spec.accent,
           text: spec.text,
        }
      : undefined;

   ctx.logger.step(`渲染封面 → ${relative(ctx.cwd, outFile) || outFile}`);
   const png = await renderCoverPng(spec);
   try {
      await writeBinary(outFile, png);
   } catch (error) {
      throw new ConfigError(`无法写入封面文件：${outFile}`, { cause: error });
   }

   const rows: Array<[string, string]> = [
      ['标题', spec.title],
      ['副标题', spec.subtitle || '<无>'],
      ['尺寸', `${spec.width} × ${spec.height}`],
      [
         '配色',
         `${spec.bg}${spec.bgTo ? ` → ${spec.bgTo}` : ''} / ${spec.accent}`,
      ],
   ];
   if (randomized) {
      rows.push(['随机', `${randomized.scheme}（seed=${randomized.seed}）`]);
   }
   rows.push(['文件', `${outFile}（${formatBytes(png.byteLength)}）`]);
   ctx.logger.table(rows);
   ctx.logger.success('封面已生成');

   const shouldUpload = options.upload === true || options.write === true;
   if (!shouldUpload) {
      if (ctx.logger.json) {
         ctx.logger.result({
            out: outFile,
            bytes: png.byteLength,
            spec,
            random: randomized
               ? { seed: randomized.seed, scheme: randomized.scheme }
               : undefined,
         });
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
      const written = await writeBackCover(config.configFile, image.id, colors);
      ctx.logger.success(
         `${colors ? 'imageId 与配色' : 'imageId'} 已写回 ${relative(ctx.cwd, written) || written}`,
      );
   } else {
      ctx.logger.info('  加 --write 可写回配置');
   }

   if (ctx.logger.json) {
      ctx.logger.result({
         out: outFile,
         bytes: png.byteLength,
         imageId: image.id,
         imageName: image.name,
         spec,
         random: randomized
            ? { seed: randomized.seed, scheme: randomized.scheme }
            : undefined,
         wroteColors: options.write === true && colors !== undefined,
         configFile: options.write ? config.configFile : undefined,
      });
   }
};

// 写回之后重新加载一次配置验证。文本手术总有翻车的可能（用户写得足够奇怪就
// 匹配不到），而写坏的配置比没写更糟。验证失败就回滚，把「改坏了」变成「没改」。
const writeBackCover = async (
   configFile: string,
   imageId: string,
   colors: CoverPalette | undefined,
): Promise<string> => {
   const original = await readText(configFile);
   const patched = applyCoverUpdate(original, { imageId, colors }, configFile);
   await writeTextAtomic(configFile, patched);
   try {
      const reloaded = await loadProblemConfig(resolve(configFile, '..'));
      if (
         reloaded.cover.mode !== 'custom' ||
         reloaded.cover.imageId !== imageId
      ) {
         throw new Error('写回后读取到的 imageId 与预期不一致');
      }
      if (colors) {
         const generate = reloaded.cover.generate;
         const matches =
            generate !== undefined &&
            generate.bg === colors.bg &&
            generate.bgTo === colors.bgTo &&
            generate.accent === colors.accent &&
            generate.text === colors.text;
         if (!matches) throw new Error('写回后读取到的配色与预期不一致');
      }
   } catch (error) {
      await writeTextAtomic(configFile, original);
      throw new ConfigError('写回封面信息后配置校验失败，已回滚原文件', {
         cause: error,
         hint: `手动把 imageId 填成 ${imageId}，并抄回配色。`,
      });
   }
   return configFile;
};

// --random 的入口：解析 seed，交给纯函数生成配色。
// --seed 单独出现没意义，提前拦下比默默忽略好。
const resolveRandom = (
   options: CoverOptions,
): ReturnType<typeof randomCoverPalette> | undefined => {
   if (!options.random) {
      if (options.seed !== undefined) {
         throw new UsageError('--seed 只有在 --random 时才有意义', {
            hint: '例如 `qpc cover --random --seed 42`。',
         });
      }
      return undefined;
   }
   return randomCoverPalette(parseSeed(options.seed));
};

const parseSeed = (value: string | undefined): number | undefined => {
   if (value === undefined) return undefined;
   if (!/^\d+$/.test(value)) {
      throw new UsageError(`--seed 必须是非负整数：${value}`, {
         hint: '例如 `qpc cover --random --seed 42`。',
      });
   }
   const seed = Number.parseInt(value, 10);
   if (!Number.isSafeInteger(seed) || seed > 0xffffffff) {
      throw new UsageError(`--seed 超出范围（0~4294967295）：${value}`);
   }
   return seed;
};

const resolveSpec = (
   title: string,
   generate: (Partial<CoverSpec> & { out?: string }) | undefined,
   options: CoverOptions,
   palette: CoverPalette | undefined,
): CoverSpec => {
   const pick = (flag: string | undefined, fromConfig: string | undefined) =>
      flag ?? fromConfig;

   const color = (
      value: string | undefined,
      fallback: string,
      field: string,
   ): string => assertHexColor(value ?? fallback, field);

   // 颜色优先级：显式参数 > --random > 配置 > 默认值。--random 生效时不再回落 到配置，否则配置里写死的配色会让 --random 看起来没生效。bgTo 特殊：随机 也可能主动决定「不要渐变」，这时同样不读配置，否则会冒出多余渐变。
   const colorFrom = (
      flag: string | undefined,
      fromRandom: string | undefined,
      fromConfig: string | undefined,
   ): string | undefined =>
      flag ?? (palette === undefined ? fromConfig : fromRandom);

   const bgTo = colorFrom(options.bgTo, palette?.bgTo, generate?.bgTo);

   return {
      title,
      subtitle: pick(options.subtitle, generate?.subtitle),
      footer: pick(options.footer, generate?.footer),
      bg: color(
         colorFrom(options.bg, palette?.bg, generate?.bg),
         COVER_DEFAULTS.bg,
         '--bg',
      ),
      bgTo:
         bgTo === undefined
            ? undefined
            : color(bgTo, COVER_DEFAULTS.bg, '--bg-to'),
      accent: color(
         colorFrom(options.accent, palette?.accent, generate?.accent),
         COVER_DEFAULTS.accent,
         '--accent',
      ),
      text: color(
         colorFrom(options.text, palette?.text, generate?.text),
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
