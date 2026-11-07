import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
   encodeSnapshotBytes,
   hasBinarySnapshotExtension,
   parseSnapshotBase64DataUrl,
} from '@challenge/shared/snapshot-content';

import { CliError } from '../core/errors';
import { walkFiles } from '../utils/fs';
import { joinSnapshotKey } from '../utils/paths';

/** 这些目录/文件永远不进快照：构建产物与依赖不是题目内容 */
export const DEFAULT_IGNORE = new Set([
   'node_modules',
   '.git',
   '.turbo',
   '.DS_Store',
   'dist',
   'coverage',
]);

export interface SnapshotResult {
   /** 键为 `/project/...` 形式的绝对路径，与 Web 端提交快照的格式一致 */
   files: Record<string, string>;
   fileCount: number;
   totalBytes: number;
   /** 被忽略规则跳过的顶层条目，用于在预检里提示"你可能漏传了东西" */
   ignored: string[];
   /** 二进制扩展名但内容是 data URL 文本、已还原成真实字节的文件（相对路径） */
   decodedDataUrls: string[];
}

export interface SnapshotOptions {
   /** 挂载路径，默认 `project`（等于 judgeUploadPath） */
   mountPath?: string;
   ignore?: (name: string) => boolean;
}

/** 把目录打包成提交快照：键须由 mountPath 打头（默认 `/project/...`），live-server 以 project 子目录为站点根。 */
export const collectSnapshot = async (
   root: string,
   options: SnapshotOptions = {},
): Promise<SnapshotResult> => {
   const mountPath = options.mountPath ?? 'project';
   const ignore = (name: string): boolean =>
      DEFAULT_IGNORE.has(name) || (options.ignore?.(name) ?? false);

   const ignored = new Set<string>();
   const relativePaths = await walkFiles(root, {
      ignore: (name) => {
         if (!ignore(name)) return false;
         ignored.add(name);
         return true;
      },
   });

   const files: Record<string, string> = {};
   const decodedDataUrls: string[] = [];
   let totalBytes = 0;

   for (const relativePath of relativePaths) {
      const absolutePath = join(root, relativePath);
      let buffer: Buffer;
      try {
         buffer = await readFile(absolutePath);
      } catch (error) {
         throw new CliError(`快照读取失败：${absolutePath}`, { cause: error });
      }
      if (hasBinarySnapshotExtension(relativePath)) {
         const decoded = parseSnapshotBase64DataUrl(
            buffer.toString('utf8').trim(),
         );
         if (decoded) {
            buffer = Buffer.from(decoded);
            decodedDataUrls.push(relativePath);
         }
      }
      files[joinSnapshotKey(mountPath, relativePath)] = encodeSnapshotBytes(
         buffer,
         hasBinarySnapshotExtension(relativePath),
      );
      totalBytes += buffer.byteLength;
   }

   return {
      files,
      fileCount: Object.keys(files).length,
      totalBytes,
      ignored: [...ignored].sort(),
      decodedDataUrls,
   };
};
