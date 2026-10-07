import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigError } from '../core/errors';
import { pathExists } from '../utils/fs';
import {
   DEFAULT_CONFIG_FILES,
   type ProblemConfig,
   problemConfigSchema,
} from './problem-config-schema';

// 配置的「形状」与「加载」分在两个文件：
//   · problem-config-schema.ts 只依赖 zod，因此 program 入口（给配置文件 import 的
//     那个模块）不会把 node:fs / jiti 也拖进打包产物。
//   · 这里负责读文件、跑 jiti、解析路径。
export * from './problem-config-schema';

export interface ResolvedProblemConfig extends ProblemConfig {
   /** 题目目录（绝对路径） */
   rootDir: string;
   /** 配置文件（绝对路径） */
   configFile: string;
   /** 解析后的题面正文 */
   detail: string;
   /** 解析后的绝对路径 */
   paths: {
      template: string;
      answer: string;
      judge: string;
   };
}

/**
 * 加载题目配置。
 *
 * 用 jiti 而不是 import()：配置文件是 **TypeScript**，而构建产物是普通 Node 进程，
 * 原生 import 不认 `.ts`。jiti 同时负责把 `@challenge/problem-creator-cli`
 * 别名到本地 program 模块，让 `defineProblemConfig` 在仓库之外的目录里也能解析。
 */
export const loadProblemConfig = async (
   rootDir: string,
   options: { file?: string } = {},
): Promise<ResolvedProblemConfig> => {
   const configFile = await findConfigFile(rootDir, options.file);
   const module = await importConfig(configFile);
   const parsed = problemConfigSchema.safeParse(module);
   if (!parsed.success) {
      // 校验信息**必须进 message**：顶层错误打印只展示 message 与 hint，
      // 放进 details 的话用户不加 --verbose 就看不到"到底哪个字段错了"。
      const issues = parsed.error.issues.map(
         (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      );
      throw new ConfigError(
         `题目配置校验失败：${configFile}\n  - ${issues.join('\n  - ')}`,
         {
            details: { issues },
            hint: '对照 examples/hello-total/problem.config.ts 的字段说明修正。',
         },
      );
   }

   const config = parsed.data;
   const detail = await resolveDetail(config, rootDir, configFile);

   return {
      ...config,
      detail,
      rootDir,
      configFile,
      paths: {
         template: resolve(rootDir, config.paths.template),
         answer: resolve(rootDir, config.paths.answer),
         judge: resolve(rootDir, config.paths.judge),
      },
   };
};

export const findConfigFile = async (
   rootDir: string,
   explicit?: string,
): Promise<string> => {
   if (explicit) {
      const candidate = isAbsolute(explicit)
         ? explicit
         : resolve(rootDir, explicit);
      if (!(await pathExists(candidate))) {
         throw new ConfigError(`指定的配置文件不存在：${candidate}`);
      }
      return candidate;
   }
   for (const name of DEFAULT_CONFIG_FILES) {
      const candidate = resolve(rootDir, name);
      if (await pathExists(candidate)) return candidate;
   }
   throw new ConfigError(
      `在 ${rootDir} 下找不到题目配置（期望 ${DEFAULT_CONFIG_FILES.join(' / ')} 之一）`,
      {
         hint: `创建 ${DEFAULT_CONFIG_FILES[0]}，或先运行 \`qpc init <目录>\`。`,
      },
   );
};

const importConfig = async (file: string): Promise<unknown> => {
   const { createJiti } = await import('jiti');
   const jiti = createJiti(import.meta.url, {
      interopDefault: true,
      moduleCache: false,
      alias: {
         // 让配置文件里的 `import { defineProblemConfig } from '@challenge/problem-creator-cli'`
         // 无论 CLI 是从源码跑（tsx）还是从 dist 跑都能解析到同一个模块。
         '@challenge/problem-creator-cli': programModulePath(),
      },
   });
   try {
      return await jiti.import(file);
   } catch (error) {
      throw new ConfigError(`无法加载配置文件：${file}`, {
         cause: error,
         details: {
            reason: error instanceof Error ? error.message : String(error),
         },
      });
   }
};

/**
 * 定位 program 模块（导出 `defineProblemConfig` 的那个文件）。
 *
 * 三种可能的布局都要兼容，因此按顺序探测而不是写死相对路径：
 *   · 打包后：dist/index.js → dist/program.js（本模块被打进 bin 入口）
 *   · 未打包的 dist：dist/domain/problem-config.js → dist/program.js
 *   · 源码直跑（tsx / vitest）：src/domain/problem-config.ts → src/program.ts
 */
const programModulePath = (): string => {
   const candidates = [
      './program.js',
      '../program.js',
      '../program.ts',
      './program.ts',
   ];
   for (const candidate of candidates) {
      const path = fileURLToPath(new URL(candidate, import.meta.url));
      if (existsSync(path)) return path;
   }
   throw new ConfigError(
      '内部错误：找不到 program 模块（无法解析 defineProblemConfig）',
      {
         details: { from: import.meta.url, candidates },
      },
   );
};

const resolveDetail = async (
   config: ProblemConfig,
   rootDir: string,
   configFile: string,
): Promise<string> => {
   if (config.detail) return config.detail;
   if (!config.detailFile) {
      throw new ConfigError(
         `题目配置缺少题面：${configFile} 里需要 detail 或 detailFile`,
         {
            hint: '提供 `detail`（正文）或 `detailFile`（相对题目目录的文件路径）。',
         },
      );
   }
   const file = resolve(rootDir, config.detailFile);
   if (!(await pathExists(file))) {
      throw new ConfigError(`detailFile 指向的文件不存在：${file}`);
   }
   return readFile(file, 'utf8');
};

export const configDirName = (configFile: string): string =>
   dirname(configFile);
