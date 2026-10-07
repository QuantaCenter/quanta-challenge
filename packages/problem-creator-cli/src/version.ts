import { readFileSync } from 'node:fs';

export const CLI_NAME = 'qpc';
export const CLI_DESCRIPTION = 'Quanta 出题工具：脚手架、离线预检、上传与发布';
export const CLI_REPOSITORY_HINT =
   '文档：packages/problem-creator-cli/README.md · 踩坑清单：docs/PROBLEM_AUTHORING.md';

/**
 * 版本号从 package.json 读，而不是写死常量：
 * 写死的版本号在 release 时必然忘记同步（本仓库的 Docker 镜像 tag 就吃过这个亏）。
 *
 * 路径对两种布局都成立：
 *   · 构建后 dist/index.js → ../package.json
 *   · 源码直跑 src/version.ts → ../package.json
 */
const readVersion = (): string => {
   try {
      const raw = readFileSync(
         new URL('../package.json', import.meta.url),
         'utf8',
      );
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version ?? '0.0.0';
   } catch {
      return '0.0.0';
   }
};

export const CLI_VERSION = readVersion();
