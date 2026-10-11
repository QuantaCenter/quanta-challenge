import { existsSync } from 'fs';
import path from 'path';
import { findRepoRoot } from '@challenge/shared/utils/repo-root';

/**
 * 解析共享 pnpm 缓存的**宿主机绝对路径**。
 *
 * ## 为什么不能直接写死 `/app/pnpm-cache`
 *
 * 这个路径有三个身份，而且必须是同一个宿主机绝对路径：
 *
 * ```
 * 宿主机             <缓存目录>            ← 本函数解析出来的值
 *   ↕ bind mount（读写）
 * 调度器容器         /app/pnpm-cache       ← PNPM_CACHE_DIR
 *   ↕ bind mount（只读，Source 用宿主机路径）
 * 题目容器           /pnpm-store           ← PROBLEM_CONTAINER_STORE_PATH
 * ```
 *
 * 调度器是通过宿主机的 Docker daemon 创建题目容器的，daemon 按**宿主机**文件系统
 * 解析 bind mount 的 `Source`，容器私有路径它根本看不到。
 *
 * 原实现把默认值写成容器路径 `/app/pnpm-cache`，于是 `pnpm dev`（进程跑在宿主机上）
 * 启动即 `fs.mkdir('/app/pnpm-cache')`，在 macOS/Linux 上直接失败：
 *
 * ```
 * [FATAL] [DEV] 初始化失败，判题服务无法工作。
 * Error: ENOENT: no such file or directory, mkdir '/app'
 *     at async PnpmCacheService.init (src/services/pnpm-cache.ts)
 * ```
 *
 * ## 规则
 *
 * 1. `PNPM_CACHE_DIR` 是绝对路径 -> 用它（容器部署的正确做法，compose 里固定
 *    `/app/pnpm-cache`；宿主机开发则是 `<仓库根>/.pnpm-cache`）
 * 2. `PNPM_CACHE_DIR` 是相对路径 -> **忽略并告警**，改用规范目录。相对路径会按
 *    各进程的 cwd 解析，而 daemon 那边按宿主机解析，两边必然对不上；
 *    与其让缓存静默写进另一个目录（症状是题目容器 `--offline` 安装大面积 miss），
 *    不如强制收敛到唯一目录并把配置问题显式喊出来。
 * 3. 未配置 -> 容器内用 `/app/pnpm-cache`（compose 漏配时的兜底）；
 *    宿主机上用规范目录 `<仓库根>/.pnpm-cache`（已在 .gitignore 中忽略）。
 */

/** 容器内的固定缓存路径；docker-compose 会显式设置 PNPM_CACHE_DIR，这里只是漏配兜底。 */
export const CONTAINER_PNPM_CACHE_DIR = '/app/pnpm-cache';

/** 本地开发的规范目录：仓库根的 `.pnpm-cache`。 */
export const canonicalPnpmCacheDir = (): string => path.join(findRepoRoot(), '.pnpm-cache');

/** 是否运行在容器里（用于区分"容器内的 /app"与"宿主机的仓库根"）。 */
const inContainer = (): boolean =>
   existsSync('/.dockerenv') || existsSync('/run/.containerenv');

let warned = false;

/** 返回共享 pnpm 缓存的宿主机绝对路径。 */
export const resolvePnpmCacheDir = (): string => {
   const configured = process.env.PNPM_CACHE_DIR?.trim();

   if (configured && path.isAbsolute(configured)) return path.resolve(configured);

   const canonical = inContainer() ? CONTAINER_PNPM_CACHE_DIR : canonicalPnpmCacheDir();

   if (configured && !warned) {
      warned = true;
      console.warn(
         `[pnpm-cache] PNPM_CACHE_DIR="${configured}" 不是绝对路径，已忽略，` +
            `改用规范目录：${canonical}。` +
            `相对路径会按进程 cwd 解析，而 Docker daemon 是按宿主机文件系统解析 ` +
            `bind mount 的 Source，两边指向的目录必然不同（题目容器会因缓存 miss 而安装失败）。` +
            `如需自定义，请配置**绝对路径**。`,
      );
   }

   return canonical;
};

/** 供调试用：把解析结果与其来源一并打印出来。 */
export const describePnpmCacheDir = (): string => {
   const configured = process.env.PNPM_CACHE_DIR?.trim();
   const source = configured
      ? path.isAbsolute(configured)
         ? `PNPM_CACHE_DIR=${configured}（绝对路径）`
         : `PNPM_CACHE_DIR=${configured}（相对路径，已忽略）`
      : inContainer()
         ? '容器兜底路径（未配置 PNPM_CACHE_DIR）'
         : '规范目录（未配置 PNPM_CACHE_DIR，本地开发）';
   return `${resolvePnpmCacheDir()}  [${source}]`;
};
