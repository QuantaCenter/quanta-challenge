import { constants } from 'node:fs';
import {
   access,
   chmod,
   mkdir,
   readdir,
   readFile,
   writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CliError } from '../core/errors';

export const pathExists = async (path: string): Promise<boolean> => {
   try {
      await access(path, constants.F_OK);
      return true;
   } catch {
      return false;
   }
};

export const ensureDir = async (dir: string): Promise<void> => {
   await mkdir(dir, { recursive: true });
};

export const readText = async (path: string): Promise<string> => {
   try {
      return await readFile(path, 'utf8');
   } catch (error) {
      throw new CliError(`无法读取文件：${path}`, {
         cause: error,
         details: { path },
      });
   }
};

/** 目录不存在时自动创建父目录 */
export const writeText = async (
   path: string,
   content: string,
): Promise<void> => {
   await ensureDir(dirname(path));
   await writeFile(path, content, 'utf8');
};

/** 与 `writeTextExclusive` 相对：存在则覆盖，用于 --force */
export const writeTextWithMode = async (
   path: string,
   content: string,
   mode?: number,
): Promise<void> => {
   await writeText(path, content);
   if (mode !== undefined) await chmod(path, mode);
};

export const listDir = async (dir: string): Promise<string[]> => {
   try {
      return await readdir(dir);
   } catch {
      return [];
   }
};

export interface WalkOptions {
   /**
    * 返回 true 表示跳过该条目。
    * 传入的是**条目名**与相对 root 的 posix 路径，便于同时支持
    * "按名字跳过（node_modules）"和"按路径跳过（template/dist）"。
    */
   ignore?: (name: string, relativePath: string) => boolean;
}

/**
 * 递归列出文件（不含目录、不含符号链接），返回相对 root 的 posix 路径。
 *
 * · 结果按字典序排序：快照要参与哈希与体量统计，顺序不稳定会让"内容没变但
 *   每次结果不同"这种幽灵问题出现。
 * · 符号链接一律跳过：跟随链接可能走出题目目录（甚至死循环），
 *   而快照本身是纯数据，链接语义无法表达。
 */
export const walkFiles = async (
   root: string,
   options: WalkOptions = {},
): Promise<string[]> => {
   const results: string[] = [];

   const walk = async (dir: string, prefix: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(
         () => [],
      );
      for (const entry of entries.sort((a, b) =>
         a.name.localeCompare(b.name),
      )) {
         if (entry.isSymbolicLink()) continue;
         const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
         if (options.ignore?.(entry.name, relativePath)) continue;
         const absolutePath = join(dir, entry.name);
         if (entry.isDirectory()) {
            await walk(absolutePath, relativePath);
            continue;
         }
         if (entry.isFile()) results.push(relativePath);
      }
   };

   await walk(root, '');
   return results.sort();
};
