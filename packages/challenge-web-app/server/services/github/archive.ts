import { gunzipSync } from 'node:zlib';
import { Parser } from 'tar';
import { encodeSnapshotBytes, hasBinarySnapshotExtension } from '@challenge/shared/snapshot-content';

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 120 * 1024 * 1024;
export const ignored = (path: string) => path.split('/').some(p => p === '.git' || p === 'node_modules');

export function archivePath(raw: string): string {
   if (raw.startsWith('/') || raw.includes('\\') || raw.includes('\0') || raw.length > 1100) throw new Error('仓库包含非法文件路径');
   const parts = raw.replace(/\/$/, '').split('/');
   if (parts.some(p => !p || p === '.' || p === '..')) throw new Error('仓库包含越界文件路径');
   return parts.slice(1).join('/');
}

export async function readArchive(response: Response, signal: AbortSignal) {
   const reader = response.body?.getReader();
   if (!reader) throw new Error('仓库下载失败');
   let size = 0;
   const chunks: Buffer[] = [];
   try {
      while (true) {
         signal.throwIfAborted();
         const { done, value } = await reader.read();
         if (done) break;
         size += value.byteLength;
         if (size > MAX_ARCHIVE_BYTES) throw new Error('仓库压缩包超过 100MB');
         chunks.push(Buffer.from(value));
      }
   } finally { await reader.cancel(); }
   return Buffer.concat(chunks);
}

export async function unpackArchive(compressed: Buffer, limits: { maxFileBytes: number; maxProjectBytes: number }) {
   if (compressed.length > MAX_ARCHIVE_BYTES) throw new Error('仓库压缩包超过 100MB');
   const tar = gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED_BYTES });
   const files: { path: string; content: string }[] = [];
   const paths = new Set<string>();
   let total = 0, count = 0;
   await new Promise<void>((resolve, reject) => {
      const parser = new Parser({ strict: true, maxMetaEntrySize: 1024 * 1024 });
      parser.on('error', reject);
      parser.on('end', resolve);
      parser.on('entry', entry => {
         try {
            if (++count > 5000) throw new Error('仓库条目数超过 5000');
            const path = archivePath(entry.path);
            if (!path || ignored(path)) { entry.resume(); return; }
            if (entry.type === 'Directory') { entry.resume(); return; }
            if (entry.type !== 'File') throw new Error('第一版不支持符号链接、硬链接或特殊文件');
            if (paths.has(path)) throw new Error('仓库包含重复文件路径');
            paths.add(path);
            total += entry.size;
            if (entry.size > limits.maxFileBytes || total > limits.maxProjectBytes) throw new Error('仓库文件超过实验室容量限制');
            const chunks: Buffer[] = [];
            entry.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            entry.on('end', () => {
               try {
                  const bytes = Buffer.concat(chunks);
                  if (bytes.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error('第一版不支持 Git LFS 文件');
                  files.push({ path: `/project/${path}`, content: encodeSnapshotBytes(bytes, hasBinarySnapshotExtension(path)) });
               } catch (error) { parser.abort(error as Error); }
            });
         } catch (error) { entry.resume(); parser.abort(error as Error); }
      });
      parser.end(tar);
   });
   return { files, sizeBytes: total };
}
