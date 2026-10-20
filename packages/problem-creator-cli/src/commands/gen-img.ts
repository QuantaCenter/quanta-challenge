import { readFile } from 'node:fs/promises';
import { basename, extname, relative, resolve } from 'node:path';

import sharp from 'sharp';

import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import { detailBaseDir } from '../domain/detail-images';
import {
   buildFlowSvg,
   type DiagramTheme,
   type FlowDirection,
} from '../domain/diagram';
import { findConfigFile, loadProblemConfig } from '../domain/problem-config';
import { launchHeadlessBrowser } from '../services/local-judge/headless-browser';
import { startStaticServer } from '../services/local-judge/static-server';
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

interface ScreenshotOptions extends CommonOptions {
   target?: string;
   selector?: string;
   viewport?: string;
   fullPage?: boolean;
   wait?: string;
}

export const registerGenImgCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   const genImg = program
      .command('gen-img')
      .description(
         '生成题面插图（流程图 / SVG 转 PNG / 页面截图），默认输出到题目目录的 images/',
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
   await emitImage(ctx, options, options.name ?? 'flow', png);
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
      const width = Number.parseInt(options.width, 10);
      if (!Number.isInteger(width) || width < 50 || width > 4096) {
         throw new UsageError(
            `--width 必须是 50~4096 的整数：${options.width}`,
         );
      }
      image = image.resize({ width });
   }
   const png = await image.png().toBuffer();
   await emitImage(
      ctx,
      options,
      options.name ?? basename(file, extname(file)),
      png,
   );
};

const runScreenshot = async (
   ctx: CommandContext,
   options: ScreenshotOptions,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   const config = await loadProblemConfig(rootDir);
   if (config.type === 'backend_service') {
      throw new UsageError('后端服务题没有页面可截图', {
         hint: '用 `qpc gen-img flow` 画请求链路，或 `qpc gen-img svg` 转手写示意图；封面用 `qpc cover`。',
      });
   }
   const target = parseChoice<'answer' | 'template'>(
      options.target ?? 'answer',
      ['answer', 'template'],
      '--target',
   );
   const viewport = parseViewport(options.viewport ?? '1280x720');
   const waitMs = Number.parseInt(options.wait ?? '300', 10);
   if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 5000) {
      throw new UsageError(`--wait 必须是 0~5000 的整数：${options.wait}`);
   }

   const site = await startStaticServer(config.paths[target]);
   const browser = await launchHeadlessBrowser();
   let png: Buffer;
   try {
      const page = await browser.newPage({ viewport });
      await page.goto(site.url, { waitUntil: 'load', timeout: 15_000 });
      await page.waitForTimeout(waitMs);
      if (options.selector) {
         const element = await page.$(options.selector);
         if (!element) {
            throw new UsageError(`页面上找不到元素：${options.selector}`);
         }
         png = await element.screenshot();
      } else {
         png = await page.screenshot({ fullPage: options.fullPage === true });
      }
   } finally {
      await browser.close().catch(() => {});
      await site.close();
   }
   await emitImage(ctx, options, options.name ?? `${target}-preview`, png);
};

/** 落盘并告诉调用方下一步：把 Markdown 片段写进题面，再 `qpc image --write`。 */
const emitImage = async (
   ctx: CommandContext,
   options: CommonOptions,
   name: string,
   png: Buffer,
): Promise<void> => {
   const rootDir = resolve(ctx.cwd, options.dir);
   const outFile = resolve(
      rootDir,
      options.out ?? `${DEFAULT_IMAGE_DIR}/${sanitizeName(name)}.png`,
   );
   await writeBinary(outFile, png);
   const meta = await sharp(png).metadata();

   const baseDir = await detailBaseDirOf(rootDir);
   const ref = relative(baseDir, outFile).split('\\').join('/');
   const snippet = `![${name}](${ref})`;

   ctx.logger.success(
      `已生成 ${relative(ctx.cwd, outFile) || outFile}（${meta.width}×${meta.height}，${formatBytes(png.byteLength)}）`,
   );
   ctx.logger.step('下一步');
   ctx.logger.info(`  1. 把这一行写进题面：${snippet}`);
   ctx.logger.info('  2. 运行 `qpc image --write` 上传并把地址回写到题面');

   if (ctx.logger.json) {
      ctx.logger.result({
         out: outFile,
         width: meta.width,
         height: meta.height,
         bytes: png.byteLength,
         markdown: snippet,
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
