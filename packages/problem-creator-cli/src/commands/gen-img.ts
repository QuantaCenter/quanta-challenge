import { readFile } from 'node:fs/promises';
import { basename, extname, relative, resolve } from 'node:path';

import type { Page } from 'playwright-core';
import sharp from 'sharp';

import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import { detailBaseDir, MAX_IMAGE_BYTES } from '../domain/detail-images';
import {
   buildFlowSvg,
   type DiagramTheme,
   type FlowDirection,
} from '../domain/diagram';
import {
   type EncodedGif,
   encodeGif,
   encodeWithinBudget,
   type GifVariant,
   resampleTimeline,
   type SourceFrame,
} from '../domain/gif';
import { findConfigFile, loadProblemConfig } from '../domain/problem-config';
import { launchHeadlessBrowser } from '../services/local-judge/headless-browser';
import { startStaticServer } from '../services/local-judge/static-server';
import {
   CURSOR_INIT_SCRIPT,
   parseRecordActions,
   RECORD_ACTION_SYNTAX,
   type Region,
   recordPage,
} from '../services/page-recorder';
import { pathExists, writeBinary } from '../utils/fs';
import { formatBytes } from '../utils/paths';
import type { CommandRegistry } from './registry';

const DEFAULT_IMAGE_DIR = 'images';

interface CommonOptions {
   dir: string;
   out?: string;
   name?: string;
}

interface FlowOptions extends CommonOptions {
   title?: string;
   direction?: string;
   theme?: string;
}

interface SvgOptions extends CommonOptions {
   width?: string;
}

interface PageOptions extends CommonOptions {
   target?: string;
   selector?: string;
   viewport?: string;
   wait?: string;
}

interface ScreenshotOptions extends PageOptions {
   fullPage?: boolean;
}

interface GifOptions extends CommonOptions {
   width?: string;
   colors?: string;
   poster?: boolean;
}

interface RecordOptions extends PageOptions, GifOptions {
   padding?: string;
   duration?: string;
   fps?: string;
   scale?: string;
   cursor?: boolean;
}

interface FramesOptions extends GifOptions {
   delay?: string;
   hold?: string;
   background?: string;
}

const MAX_RECORD_MS = 15_000;
const RECORD_TAIL_MS = 1_000;
const DEFAULT_RECORD_MS = 3_000;
const DEFAULT_RECORD_MAX_WIDTH = 1600;
const GIF_SIZE_HINT =
   '缩短 --duration、减小 --width / --fps / --colors，或用 --selector 只录关键区域。';

export const registerGenImgCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   const genImg = program
      .command('gen-img')
      .description(
         '生成题面插图（流程图 / SVG 转 PNG / 页面截图 / 动效 GIF），默认输出到题目目录的 images/',
      );

   genImg
      .command('flow')
      .description('流程示意图：每个参数是一个步骤，按顺序用箭头连接')
      .argument('<steps...>', '步骤文字（步骤内用 \\n 换行）')
      .option('--dir <dir>', '题目目录（默认当前目录）', '.')
      .option(
         '--name <name>',
         '文件名（不含扩展名），输出 images/<name>.png',
         'flow',
      )
      .option('--out <file>', '输出文件（相对题目目录，优先于 --name）')
      .option('--title <text>', '图标题')
      .option(
         '--direction <dir>',
         'lr（横向）| tb（纵向）；默认超过 4 步自动纵向',
      )
      .option('--theme <theme>', 'light | dark', 'light')
      .action(async (steps: string[], options: FlowOptions) => {
         const ctx = await context();
         await runFlow(ctx, steps, options);
      });

   genImg
      .command('svg')
      .description('把手写的 SVG（示意图、布局草图、坐标图）转成 PNG')
      .argument('<input>', 'SVG 文件路径（相对当前目录）')
      .option('--dir <dir>', '题目目录（默认当前目录）', '.')
      .option('--name <name>', '文件名（不含扩展名），默认取 SVG 文件名')
      .option('--out <file>', '输出文件（相对题目目录，优先于 --name）')
      .option('--width <px>', '输出宽度（按比例缩放）')
      .action(async (input: string, options: SvgOptions) => {
         const ctx = await context();
         await runSvg(ctx, input, options);
      });

   genImg
      .command('screenshot')
      .description('前端题：截取参考解（或模板）页面，用作效果图')
      .option('--dir <dir>', '题目目录（默认当前目录）', '.')
      .option('--target <target>', 'answer | template', 'answer')
      .option('--selector <css>', '只截某个元素')
      .option('--viewport <WxH>', '视口尺寸（与判题机默认一致）', '1280x720')
      .option('--full-page', '截整页（默认只截首屏）')
      .option('--wait <ms>', '页面加载后再等待的毫秒数（最多 5000）', '300')
      .option('--name <name>', '文件名（不含扩展名），默认 <target>-preview')
      .option('--out <file>', '输出文件（相对题目目录，优先于 --name）')
      .action(async (options: ScreenshotOptions) => {
         const ctx = await context();
         await runScreenshot(ctx, options);
      });

   genImg
      .command('record')
      .description('前端题：录制参考解（或模板）页面的动效，输出 GIF')
      .argument('[actions...]', `按顺序执行的交互：${RECORD_ACTION_SYNTAX}`)
      .option('--dir <dir>', '题目目录（默认当前目录）', '.')
      .option('--target <target>', 'answer | template', 'answer')
      .option('--selector <css>', '只录某个元素所在区域')
      .option('--padding <px>', '配合 --selector，元素四周多录的像素', '0')
      .option('--viewport <WxH>', '视口尺寸（与判题机默认一致）', '1280x720')
      .option(
         '--wait <ms>',
         '页面加载后、开始录制前等待的毫秒数（最多 5000）',
         '300',
      )
      .option(
         '--duration <ms>',
         `录制总时长（最多 ${MAX_RECORD_MS}）；默认有交互时为交互结束后再录 ${RECORD_TAIL_MS}ms，否则 ${DEFAULT_RECORD_MS}`,
      )
      .option('--fps <n>', '帧率（1~30）', '15')
      .option(
         '--scale <n>',
         '像素密度（1 | 2）；2 在高清屏上清晰，体积约为 1 的 2~4 倍',
         '2',
      )
      .option(
         '--width <px>',
         `输出宽度上限（只缩小不放大），默认 ${DEFAULT_RECORD_MAX_WIDTH}`,
      )
      .option('--colors <n>', '调色板颜色数（2~256）', '256')
      .option(
         '--cursor',
         '画出鼠标指针，click / hover 时平滑移动并显示点击涟漪',
      )
      .option('--poster', '另存最后一帧为同名 PNG')
      .option('--name <name>', '文件名（不含扩展名），默认 <target>-record')
      .option('--out <file>', '输出文件（相对题目目录，优先于 --name）')
      .action(async (actions: string[], options: RecordOptions) => {
         const ctx = await context();
         await runRecord(ctx, actions, options);
      });

   genImg
      .command('frames')
      .description(
         '把多张 SVG / PNG 按顺序拼成 GIF（算法步骤、状态流转等分步动画）',
      )
      .argument(
         '<inputs...>',
         '帧文件（相对当前目录，按参数顺序播放；用通配符时序号要补零，否则 10 会排在 2 前面）',
      )
      .option('--dir <dir>', '题目目录（默认当前目录）', '.')
      .option('--delay <ms>', '每帧停留毫秒数', '800')
      .option('--hold <ms>', '最后一帧停留毫秒数（循环前停顿）', '2000')
      .option('--width <px>', '输出宽度（只缩小不放大，默认第一帧宽度）')
      .option('--colors <n>', '调色板颜色数（2~256）', '256')
      .option(
         '--background <color>',
         '透明区域与尺寸不一致时的填充色',
         '#ffffff',
      )
      .option('--poster', '另存最后一帧为同名 PNG')
      .option('--name <name>', '文件名（不含扩展名）', 'frames')
      .option('--out <file>', '输出文件（相对题目目录，优先于 --name）')
      .action(async (inputs: string[], options: FramesOptions) => {
         const ctx = await context();
         await runFrames(ctx, inputs, options);
      });
};

const runFlow = async (
   ctx: CommandContext,
   steps: string[],
   options: FlowOptions,
): Promise<void> => {
   if (steps.length < 2) {
      throw new UsageError('流程图至少需要 2 个步骤', {
         hint: '例如 `qpc gen-img flow "浏览器" "POST /items" "服务端校验" "201 Created"`。',
      });
   }
   const direction = parseChoice<FlowDirection>(
      options.direction ?? (steps.length > 4 ? 'tb' : 'lr'),
      ['lr', 'tb'],
      '--direction',
   );
   const theme = parseChoice<DiagramTheme>(
      options.theme ?? 'light',
      ['light', 'dark'],
      '--theme',
   );
   const svg = buildFlowSvg({ steps, title: options.title, direction, theme });
   const png = await sharp(Buffer.from(svg, 'utf8'), { density: 144 })
      .png()
      .toBuffer();
   await emitImage(ctx, options, options.name ?? 'flow', {
      data: png,
      ext: 'png',
   });
};

const runSvg = async (
   ctx: CommandContext,
   input: string,
   options: SvgOptions,
): Promise<void> => {
   const file = resolve(ctx.cwd, input);
   if (!(await pathExists(file))) {
      throw new UsageError(`SVG 文件不存在：${file}`);
   }
   let image = sharp(await readFile(file), { density: 144 });
   if (options.width !== undefined) {
      image = image.resize({
         width: parseIntOption(options.width, '--width', 50, 4096),
      });
   }
   const png = await image.png().toBuffer();
   await emitImage(
      ctx,
      options,
      options.name ?? basename(file, extname(file)),
      {
         data: png,
         ext: 'png',
      },
   );
};

const runScreenshot = async (
   ctx: CommandContext,
   options: ScreenshotOptions,
): Promise<void> => {
   const { target, value: png } = await withTargetPage(
      ctx,
      options,
      {},
      async (page) => {
         if (options.selector) {
            const element = await page.$(options.selector);
            if (!element) {
               throw new UsageError(`页面上找不到元素：${options.selector}`);
            }
            return element.screenshot();
         }
         return page.screenshot({ fullPage: options.fullPage === true });
      },
   );
   await emitImage(ctx, options, options.name ?? `${target}-preview`, {
      data: png,
      ext: 'png',
   });
};

const runRecord = async (
   ctx: CommandContext,
   tokens: string[],
   options: RecordOptions,
): Promise<void> => {
   const actions = parseRecordActions(tokens);
   const durationMs =
      options.duration !== undefined
         ? parseIntOption(options.duration, '--duration', 500, MAX_RECORD_MS)
         : actions.length > 0
           ? undefined
           : DEFAULT_RECORD_MS;
   const padding = parseIntOption(options.padding ?? '0', '--padding', 0, 500);
   const base: GifVariant = {
      fps: parseIntOption(options.fps ?? '15', '--fps', 1, 30),
      width:
         options.width === undefined
            ? DEFAULT_RECORD_MAX_WIDTH
            : parseIntOption(options.width, '--width', 100, 3840),
      colors: parseIntOption(options.colors ?? '256', '--colors', 2, 256),
   };
   const scale = parseIntOption(options.scale ?? '2', '--scale', 1, 2);
   const cursor = options.cursor === true;

   const { target, value: recording } = await withTargetPage(
      ctx,
      options,
      {
         initScript: cursor ? CURSOR_INIT_SCRIPT : undefined,
         deviceScaleFactor: scale,
      },
      async (page, viewport) => {
         const clip = options.selector
            ? await selectorArea(page, options.selector, padding, viewport)
            : undefined;
         ctx.logger.step(
            `录制中（${durationMs === undefined ? `${actions.length} 个交互步骤 + ${RECORD_TAIL_MS}ms` : `${durationMs}ms`}）`,
         );
         return recordPage(page, {
            actions,
            viewport,
            clip,
            scale,
            durationMs,
            tailMs: RECORD_TAIL_MS,
            maxMs: MAX_RECORD_MS,
            cursor,
         });
      },
   );
   if (recording.truncated) {
      ctx.logger.warn(
         `交互步骤没跑完就到了时长上限（${Math.min(durationMs ?? MAX_RECORD_MS, MAX_RECORD_MS)}ms），后面的步骤没录进去`,
      );
   }

   const build = (variant: GifVariant) =>
      encodeGif(
         resampleTimeline(
            recording.frames,
            variant.fps ?? 15,
            recording.durationMs,
         ),
         {
            width: variant.width,
            colors: variant.colors,
            background: '#ffffff',
         },
      );
   const gif = await encodeGifWithinLimit(ctx, base, build);
   if (gif.frames === 1) {
      ctx.logger.warn('录制期间画面没有变化，输出的是静态图');
      ctx.logger.detail(
         '确认触发动效的交互已写成步骤（如 hover:.card），或用 --wait 调整开始时机',
      );
   }
   await emitGif(ctx, options, options.name ?? `${target}-record`, gif);
};

const runFrames = async (
   ctx: CommandContext,
   inputs: string[],
   options: FramesOptions,
): Promise<void> => {
   if (inputs.length < 2) {
      throw new UsageError('至少需要 2 帧', {
         hint: '例如 `qpc gen-img frames drafts/step-01.svg drafts/step-02.svg --delay 800`。',
      });
   }
   const delay = parseIntOption(options.delay ?? '800', '--delay', 20, 10_000);
   const hold = parseIntOption(options.hold ?? '2000', '--hold', 20, 10_000);
   const base: GifVariant = {
      width:
         options.width === undefined
            ? undefined
            : parseIntOption(options.width, '--width', 50, 4096),
      colors: parseIntOption(options.colors ?? '256', '--colors', 2, 256),
   };
   const background = options.background ?? '#ffffff';

   const frames: SourceFrame[] = [];
   for (const [index, input] of inputs.entries()) {
      const file = resolve(ctx.cwd, input);
      if (!(await pathExists(file))) {
         throw new UsageError(`帧文件不存在：${file}`);
      }
      const content = await readFile(file);
      const image =
         extname(file).toLowerCase() === '.svg'
            ? await sharp(content, { density: 144 }).png().toBuffer()
            : content;
      frames.push({
         image,
         durationMs: index === inputs.length - 1 ? hold : delay,
      });
   }
   const gif = await encodeGifWithinLimit(ctx, base, (variant) =>
      encodeGif(frames, {
         width: variant.width,
         colors: variant.colors,
         background,
      }),
   );
   await emitGif(ctx, options, options.name ?? 'frames', gif);
};

interface TargetPageSetup {
   initScript?: string;
   deviceScaleFactor?: number;
}

/** 起静态站点 + 无头浏览器打开参考解（或模板），等 --wait 后交给回调；结束时清理。 */
const withTargetPage = async <T>(
   ctx: CommandContext,
   options: PageOptions,
   setup: TargetPageSetup,
   fn: (page: Page, viewport: { width: number; height: number }) => Promise<T>,
): Promise<{ target: 'answer' | 'template'; value: T }> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   const config = await loadProblemConfig(rootDir);
   if (config.type === 'backend_service') {
      throw new UsageError('后端服务题没有页面可截图或录制', {
         hint: '用 `qpc gen-img flow` 画请求链路，`qpc gen-img svg` / `frames` 转手写示意图或分步动画；封面用 `qpc cover`。',
      });
   }
   const target = parseChoice<'answer' | 'template'>(
      options.target ?? 'answer',
      ['answer', 'template'],
      '--target',
   );
   const viewport = parseViewport(options.viewport ?? '1280x720');
   const waitMs = parseIntOption(options.wait ?? '300', '--wait', 0, 5000);

   const site = await startStaticServer(config.paths[target]);
   const browser = await launchHeadlessBrowser();
   try {
      const page = await browser.newPage({
         viewport,
         deviceScaleFactor: setup.deviceScaleFactor ?? 1,
         reducedMotion: 'no-preference',
      });
      if (setup.initScript) await page.addInitScript(setup.initScript);
      await page.goto(site.url, { waitUntil: 'load', timeout: 15_000 });
      await page.waitForTimeout(waitMs);
      return { target, value: await fn(page, viewport) };
   } finally {
      await browser.close().catch(() => {});
      await site.close();
   }
};

/** 元素区域（CSS 像素）加上 padding，并限制在视口内。 */
const selectorArea = async (
   page: Page,
   selector: string,
   padding: number,
   viewport: { width: number; height: number },
): Promise<Region> => {
   const element = await page.$(selector);
   if (!element) throw new UsageError(`页面上找不到元素：${selector}`);
   await element.scrollIntoViewIfNeeded();
   const box = await element.boundingBox();
   if (!box) throw new UsageError(`元素不可见：${selector}`);
   const left = Math.max(0, box.x - padding);
   const top = Math.max(0, box.y - padding);
   const right = Math.min(viewport.width, box.x + box.width + padding);
   const bottom = Math.min(viewport.height, box.y + box.height + padding);
   if (right - left < 1 || bottom - top < 1) {
      throw new UsageError(`元素不在视口内：${selector}`, {
         hint: '调大 --viewport，或先用 scroll:<选择器> 把它滚进来。',
      });
   }
   return { left, top, width: right - left, height: bottom - top };
};

const encodeGifWithinLimit = async (
   ctx: CommandContext,
   base: GifVariant,
   build: (variant: GifVariant) => Promise<EncodedGif>,
): Promise<EncodedGif> => {
   const { result, degraded } = await encodeWithinBudget(
      base,
      build,
      MAX_IMAGE_BYTES,
   );
   if (result.gif.byteLength > MAX_IMAGE_BYTES) {
      throw new UsageError(
         `GIF 压不进 ${formatBytes(MAX_IMAGE_BYTES)}（当前 ${formatBytes(result.gif.byteLength)}），平台无法上传`,
         { hint: GIF_SIZE_HINT },
      );
   }
   if (degraded.length > 0) {
      ctx.logger.warn(
         `超过 ${formatBytes(MAX_IMAGE_BYTES)}，已自动降级：${degraded.join(' → ')}`,
      );
      ctx.logger.detail(`想保留画质：${GIF_SIZE_HINT}`);
   }
   return result;
};

const emitGif = async (
   ctx: CommandContext,
   options: GifOptions,
   name: string,
   gif: EncodedGif,
): Promise<void> => {
   await emitImage(ctx, options, name, {
      data: gif.gif,
      ext: 'gif',
      width: gif.width,
      height: gif.height,
      summary: `${gif.frames} 帧 / ${(gif.durationMs / 1000).toFixed(1)}s`,
      poster: options.poster ? gif.poster : undefined,
      extra: { frames: gif.frames, durationMs: gif.durationMs },
   });
};

interface ImageOutput {
   data: Buffer;
   ext: 'png' | 'gif';
   width?: number;
   height?: number;
   /** 追加在尺寸后的说明，如帧数与时长 */
   summary?: string;
   /** 同名 PNG 静态兜底 */
   poster?: Buffer;
   extra?: Record<string, unknown>;
}

/** 落盘并告诉调用方下一步：把 Markdown 片段写进题面，再 `qpc image --write`。 */
const emitImage = async (
   ctx: CommandContext,
   options: CommonOptions,
   name: string,
   image: ImageOutput,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   if (
      options.out !== undefined &&
      extname(options.out).toLowerCase() !== `.${image.ext}`
   ) {
      throw new UsageError(`--out 的扩展名应为 .${image.ext}：${options.out}`);
   }
   const outFile = resolve(
      rootDir,
      options.out ?? `${DEFAULT_IMAGE_DIR}/${sanitizeName(name)}.${image.ext}`,
   );
   await writeBinary(outFile, image.data);
   let { width, height } = image;
   if (width === undefined || height === undefined) {
      const meta = await sharp(image.data).metadata();
      width = meta.width;
      height = meta.height;
   }

   const baseDir = await detailBaseDirOf(rootDir);
   const ref = relative(baseDir, outFile).split('\\').join('/');
   const snippet = `![${name}](${ref})`;

   const facts = [
      `${width}×${height}`,
      image.summary,
      formatBytes(image.data.byteLength),
   ].filter(Boolean);
   ctx.logger.success(
      `已生成 ${relative(ctx.cwd, outFile) || outFile}（${facts.join('，')}）`,
   );
   let posterFile: string | undefined;
   if (image.poster) {
      posterFile = `${outFile.slice(0, -extname(outFile).length)}.png`;
      await writeBinary(posterFile, image.poster);
      ctx.logger.success(
         `已生成 ${relative(ctx.cwd, posterFile) || posterFile}（最后一帧）`,
      );
   }
   ctx.logger.step('下一步');
   ctx.logger.info(`  1. 把这一行写进题面：${snippet}`);
   ctx.logger.info('  2. 运行 `qpc image --write` 上传并把地址回写到题面');

   if (ctx.logger.json) {
      ctx.logger.result({
         out: outFile,
         width,
         height,
         bytes: image.data.byteLength,
         markdown: snippet,
         ...(posterFile ? { poster: posterFile } : {}),
         ...image.extra,
      });
   }
};

const detailBaseDirOf = async (rootDir: string): Promise<string> => {
   try {
      await findConfigFile(rootDir);
      return detailBaseDir(await loadProblemConfig(rootDir));
   } catch {
      return rootDir;
   }
};

const sanitizeName = (name: string): string =>
   name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '') ||
   'image';

const parseChoice = <T extends string>(
   value: string,
   choices: readonly T[],
   flag: string,
): T => {
   if (!(choices as readonly string[]).includes(value)) {
      throw new UsageError(`${flag} 不合法：${value}`, {
         hint: `可选值：${choices.join(' | ')}`,
      });
   }
   return value as T;
};

const parseIntOption = (
   value: string,
   flag: string,
   min: number,
   max: number,
): number => {
   const parsed = Number(value);
   if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new UsageError(`${flag} 必须是 ${min}~${max} 的整数：${value}`);
   }
   return parsed;
};

const parseViewport = (value: string): { width: number; height: number } => {
   const match = /^(\d{2,4})x(\d{2,4})$/.exec(value);
   if (!match) {
      throw new UsageError(
         `--viewport 格式应为 宽x高，例如 1280x720：${value}`,
      );
   }
   return {
      width: Number.parseInt(match[1] as string, 10),
      height: Number.parseInt(match[2] as string, 10),
   };
};
