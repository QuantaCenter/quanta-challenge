import { existsSync } from 'fs';
import path from 'path';

/**
 * 解析本地存储（local_store）的绝对路径。
 *
 * ## 为什么需要这个统一解析器
 *
 * 判题相关文件（题目封面 = 判题首屏截图、影子文件、成就图等）由**判题调度器**写入，
 * 却由 **Web 应用**的 `/api/static/[filePath]` 读取。这两个进程各自在不同的包目录下启动：
 *
 * - `packages/challenge-judge-scheduler`
 * - `packages/challenge-web-app`
 *
 * 如果两边都用 `process.env.LOCAL_STORE_PATH || './local_store'`，相对路径会各自按
 * **进程 cwd** 解析，于是变成两个不同目录：写进 A、读自 B，表现为
 * **所有题目封面 404，页面只显示 `<img>` 的 alt 文本 "Cover Image"**。
 *
 * 这个坑在历史上至少出现过两次，因此这里把"存在唯一标准目录"作为硬约束：
 * 无论进程在哪启动、环境变量怎么配，最终都只会落到同一个绝对路径。
 *
 * ## 目录布局
 *
 * 标准目录固定在 `packages/challenge-web-app/local_store`，原因是生产环境
 * `docker-compose.yaml` 给 Web 应用挂载的卷就在 `/app/packages/challenge-web-app/local_store`，
 * 保持同一处可以避免再出现"容器里读、容器外写"的分裂。
 */

/** 向上查找 monorepo 根目录；找不到就退回起点，保证函数不会抛错。 */
const findRepoRoot = (startDir: string): string => {
   let current = startDir;
   for (let i = 0; i < 12; i++) {
      if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
   }
   return startDir;
};

/** 唯一的规范存储目录（绝对路径）。 */
export const canonicalLocalStorePath = (): string => {
   const root = findRepoRoot(process.cwd());
   return path.join(root, 'packages', 'challenge-web-app', 'local_store');
};

let warned = false;

/**
 * 返回 local_store 的绝对路径。
 *
 * 规则（刻意收紧，避免再次出现双目录）：
 * 1. `LOCAL_STORE_PATH` 是绝对路径 -> 用它（容器部署的正确做法，例如 /app/packages/challenge-web-app/local_store）
 * 2. 未配置、或配的是相对路径 -> **一律使用规范目录**，并在相对路径会指向别处时打印警告
 *
 * 第 2 条是刻意不兼容旧行为的：过去相对路径会按 cwd 解析，而那正是 bug 的来源。
 * 与其让文件静默写到另一个目录（症状是页面图片消失、且极难定位），
 * 不如强制收敛到唯一目录并把配置问题显式喊出来。
 */
export const resolveLocalStorePath = (): string => {
   const configured = process.env.LOCAL_STORE_PATH?.trim();

   if (configured && path.isAbsolute(configured)) return path.resolve(configured);

   const canonical = canonicalLocalStorePath();

   if (configured && !warned) {
      warned = true;
      const wouldBe = path.resolve(process.cwd(), configured);
      if (wouldBe !== canonical) {
         console.warn(
            `[local-store] LOCAL_STORE_PATH="${configured}" 是相对路径，` +
               `按 cwd 会解析到 ${wouldBe}，与 Web 应用的读取目录不一致，` +
               `将导致题目封面等图片 404。已强制改用规范目录：${canonical}。` +
               `如需自定义，请配置**绝对路径**。`,
         );
      }
   }

   return canonical;
};

/** 供调试用：把解析结果与其来源一并打印出来。 */
export const describeLocalStorePath = (): string => {
   const configured = process.env.LOCAL_STORE_PATH?.trim();
   const resolved = resolveLocalStorePath();
   const source = configured
      ? path.isAbsolute(configured)
         ? `LOCAL_STORE_PATH=${configured}（绝对路径）`
         : `LOCAL_STORE_PATH=${configured}（相对路径，已忽略，使用规范目录）`
      : '规范目录（未配置 LOCAL_STORE_PATH）';
   return `${resolved}  [${source}]`;
};
