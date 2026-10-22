import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
   buildBackendInitCommand,
   DEFAULT_BACKEND_SERVICE_IMAGE_ID,
   getBackendServiceDefaultPort,
} from '@challenge/shared/backend-service-image';

import { ConfigError } from '../core/errors';
import {
   COVER_DEFAULTS,
   COVER_SUGGESTED_BG_TO,
   type CoverSpec,
} from '../domain/cover';
import type { Difficulty, ProblemType } from '../domain/problem-config';
import { readText, walkFiles } from '../utils/fs';

export interface ScaffoldVars {
   title: string;
   // 题型：前端（静态站点 + Playwright）或后端服务（常驻进程 + HTTP）
   type: ProblemType;
   difficulty: Difficulty;
   tagIds: number[];
   // 站点根目录 / 判题打包目录
   mountPath: string;
}

export interface ScaffoldFile {
   // 相对题目目录的 posix 路径
   path: string;
   content: string;
}

// 需要 init 额外光栅化的封面（后端题型没有首屏可截图）
export interface ScaffoldCover {
   path: string;
   spec: CoverSpec;
}

export interface ScaffoldResult {
   files: ScaffoldFile[];
   cover?: ScaffoldCover;
}

// 模板里用 `gitignore` 这个名字：真叫 `.gitignore` 会被 git 当成忽略规则。
const GITIGNORE_TEMPLATE = 'gitignore';

// 模板文件里的占位符，生成时一次性插值，产物里不留任何 `{{...}}`。
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

// 模板是包根 `templates/<type>/` 下的真实文件：源码直跑取 ../../templates，打包产物取 ../templates。
const TEMPLATE_DIR_CANDIDATES = ['../../templates', '../templates'] as const;

const resolveTemplateDir = (type: ProblemType): string => {
   for (const candidate of TEMPLATE_DIR_CANDIDATES) {
      const dir = fileURLToPath(
         new URL(`${candidate}/${type}`, import.meta.url),
      );
      if (existsSync(dir)) return dir;
   }
   throw new ConfigError('内部错误：找不到脚手架模板目录', {
      details: { from: import.meta.url, type },
   });
};

// 把 `templates/<type>/` 下的文件读出、替换 `{{...}}` 占位符后落到题目目录；示例刻意零依赖，离线安装才有稳定第一步。
export const buildProblemScaffold = async (
   vars: ScaffoldVars,
): Promise<ScaffoldResult> => {
   const templateDir = resolveTemplateDir(vars.type);
   const context = buildContext(vars);

   // 忽略编辑器/系统垃圾文件：模板目录在版本库里，本地浏览可能留下 .DS_Store。
   const relativePaths = await walkFiles(templateDir, {
      ignore: (name) => name === '.DS_Store',
   });
   const files = await Promise.all(
      relativePaths.map(async (relativePath) => {
         const raw = await readText(join(templateDir, relativePath));
         return {
            path:
               relativePath === GITIGNORE_TEMPLATE
                  ? '.gitignore'
                  : relativePath,
            content: renderTemplate(raw, context, relativePath),
         };
      }),
   );

   return {
      files,
      cover:
         vars.type === 'backend_service'
            ? { path: 'cover.png', spec: buildBackendCoverSpec(vars.title) }
            : undefined,
   };
};

const renderTemplate = (
   content: string,
   context: Record<string, string>,
   file: string,
): string =>
   content.replace(PLACEHOLDER, (match, key: string) => {
      const value = context[key];
      if (value === undefined) {
         throw new ConfigError(`模板 ${file} 引用了未知占位符 ${match}`, {
            details: {
               file,
               placeholder: key,
               available: Object.keys(context).sort(),
            },
         });
      }
      return value;
   });

const buildContext = (vars: ScaffoldVars): Record<string, string> => {
   const { title, type, difficulty, tagIds, mountPath } = vars;
   const context: Record<string, string> = {
      title,
      difficulty,
      tagIds: tagIds.join(', '),
      mountPath,
      initCommand:
         type === 'backend_service'
            ? buildBackendInitCommand(
                 DEFAULT_BACKEND_SERVICE_IMAGE_ID,
                 mountPath,
              )
            : `npx -y vite --port 3000 ./${mountPath}`,
   };

   if (type === 'backend_service') {
      context.serviceImage = DEFAULT_BACKEND_SERVICE_IMAGE_ID;
      context.servicePort = String(
         getBackendServiceDefaultPort(DEFAULT_BACKEND_SERVICE_IMAGE_ID),
      );
      context.coverBg = BACKEND_COVER.bg;
      context.coverBgTo = BACKEND_COVER.bgTo;
      context.coverAccent = BACKEND_COVER.accent;
      context.coverSubtitle = BACKEND_COVER.subtitle;
   }

   return context;
};

// 后端脚手架示例用的封面配色（也写进模板里的 `cover.generate`）
const BACKEND_COVER = {
   bg: COVER_DEFAULTS.bg,
   bgTo: COVER_SUGGESTED_BG_TO,
   accent: COVER_DEFAULTS.accent,
   subtitle: 'GET /health',
} as const;

// 后端题型默认封面：示例 API 没有首屏可截图，init 先本地渲染 cover.png，再由 `qpc cover --upload --write` 上传换 id。
export const buildBackendCoverSpec = (title: string): CoverSpec => ({
   title,
   subtitle: BACKEND_COVER.subtitle,
   bg: BACKEND_COVER.bg,
   bgTo: BACKEND_COVER.bgTo,
   accent: BACKEND_COVER.accent,
   text: COVER_DEFAULTS.text,
   width: COVER_DEFAULTS.width,
   height: COVER_DEFAULTS.height,
});
