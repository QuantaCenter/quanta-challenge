import { existsSync } from 'fs';
import path from 'path';

/**
 * 向上查找 monorepo 根目录（以 `pnpm-workspace.yaml` 为标志）。
 *
 * 多个"必须所有进程共用同一个目录"的场景（local_store、共享 pnpm 缓存）都需要
 * 先定位仓库根：只有基于根解析出来的绝对路径，才能保证 `pnpm dev` 在
 * `packages/<pkg>` 下启动、`pnpm start` 在别处启动时都落到同一处。
 *
 * 找不到就退回起点目录，保证函数不会抛错（调用方拿到的一定是个绝对路径）。
 */
export const findRepoRoot = (startDir: string = process.cwd()): string => {
   let current = path.resolve(startDir);
   for (let i = 0; i < 12; i++) {
      if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
   }
   return path.resolve(startDir);
};
