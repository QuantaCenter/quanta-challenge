import { constants } from 'node:fs';
import {
   access,
   chmod,
   mkdir,
   readdir,
   readFile,
   rename,
   rm,
   stat,
   writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

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

/** 原子写文本：先写临时文件再 rename，中断时原文件保持完整。 */
export const writeTextAtomic = async (
   path: string,
   content: string,
): Promise<void> => {
   const dir = dirname(path);
   await ensureDir(dir);
   const temp = join(dir, `.${basename(path)}.${process.pid}.tmp`);
   const mode = await stat(path)
      .then((info) => info.mode)
      .catch(() => undefined);
   try {
      await writeFile(temp, content, 'utf8');
      if (mode !== undefined) await chmod(temp, mode);
      await rename(temp, path);
   } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
   }
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

/** 二进制写盘（封面 PNG）。与 writeText 一样自动建父目录。 */
export const writeBinary = async (
   path: string,
   content: Uint8Array,
): Promise<void> => {
   await ensureDir(dirname(path));
   await writeFile(path, content);
};

export const listDir = async (dir: string): Promise<string[]> => {
   try {
      return await readdir(dir);
   } catch {
      return [];
   }
};

export interface WalkOptions {
   /** 返回 true 表示跳过该条目；入参为条目名与相对 root 的 posix 路径，支持按名字或路径跳过。 */
   ignore?: (name: string, relativePath: string) => boolean;
}

/** 递归列出文件（不含目录与符号链接），结果按字典序排序（保证哈希稳定）；符号链接一律跳过。 */
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
