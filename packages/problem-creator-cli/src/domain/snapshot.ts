import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { CliError } from '../core/errors';
import { walkFiles } from '../utils/fs';
import { joinSnapshotKey } from '../utils/paths';

/**
 * 二进制扩展名：与 packages/challenge-web-app/app/configs/accepted-pack-extension.ts
 * 的 `acceptedBinaryExtensions` 对齐。快照里二进制必须以 base64 传输，
 * 按 utf8 读会静默损坏文件（图片变成乱码，判题时表现为封面/资源加载失败）。
 */
export const BINARY_EXTENSIONS = new Set([
   'png',
   'jpg',
   'jpeg',
   'gif',
   'bmp',
   'tiff',
   'webp',
   'ico',
   'cur',
]);

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
}

export interface SnapshotOptions {
   /** 挂载路径，默认 `project`（等于 judgeUploadPath） */
   mountPath?: string;
   ignore?: (name: string) => boolean;
}

/**
 * 把一个目录打包成提交快照。
 *
 * 键格式必须由 `mountPath` 打头（默认 `/project/...`）：
 * 调度器会原样还原到 live-server 容器的 /app 下，而题目的 initCommand
 * 与 live-server 镜像都以 `project` 子目录为站点根（见 PROBLEM_AUTHORING 坑 11）。
 */
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
   let totalBytes = 0;

   for (const relativePath of relativePaths) {
      const absolutePath = join(root, relativePath);
      let buffer: Buffer;
      try {
         buffer = await readFile(absolutePath);
      } catch (error) {
         throw new CliError(`快照读取失败：${absolutePath}`, { cause: error });
      }
      const extension = extname(relativePath).slice(1).toLowerCase();
      files[joinSnapshotKey(mountPath, relativePath)] = BINARY_EXTENSIONS.has(
         extension,
      )
         ? buffer.toString('base64')
         : buffer.toString('utf8');
      totalBytes += buffer.byteLength;
   }

   return {
      files,
      fileCount: Object.keys(files).length,
      totalBytes,
      ignored: [...ignored].sort(),
   };
};
