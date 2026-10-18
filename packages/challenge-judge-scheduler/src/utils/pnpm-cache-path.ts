import { existsSync } from 'fs';
import path from 'path';
import { findRepoRoot } from '@challenge/shared/utils/repo-root';
import { logger } from './logger';

/** 解析共享 pnpm 缓存的宿主机绝对路径：PNPM_CACHE_DIR 为绝对路径则使用，相对路径忽略并告警，未配置时容器内用 /app/pnpm-cache、宿主机用 <仓库根>/.pnpm-cache。 */

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
      logger.warn(
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
