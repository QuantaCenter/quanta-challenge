import { existsSync } from 'fs';
import path from 'path';

/** 向上查找 monorepo 根目录（以 pnpm-workspace.yaml 为标志），保证各进程解析出同一目录；找不到则退回起点目录。 */
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
