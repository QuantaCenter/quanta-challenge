/** Versioned, uncompressed Vivari image. The upload API applies gzip outside this format. */
export const VIVARI_IMAGE_MAGIC = 'QVIM1\n';

export type VivariImageEntry =
   | { path: string; kind: 'directory'; mode: number }
   | { path: string; kind: 'file'; mode: number; size: number }
   | { path: string; kind: 'symlink'; mode: number; target: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAGIC = encoder.encode(VIVARI_IMAGE_MAGIC);
const MAX_HEADER_BYTES = 32 * 1024 * 1024;

const validPath = (path: string) =>
   path.length > 0 &&
   !path.startsWith('/') &&
   !path.includes('\\') &&
   !path.includes('\0') &&
   path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
const validLink = (path: string, target: string) => {
   if (!target || target.startsWith('/') || target.includes('\\') || target.includes('\0')) return false;
   const parts = path.split('/').slice(0, -1);
   for (const segment of target.split('/')) {
      if (segment === '.' || segment === '') continue;
      if (segment === '..') {
         if (!parts.length) return false;
         parts.pop();
      } else parts.push(segment);
   }
   return true;
};

export const encodeVivariImage = (
   entries: VivariImageEntry[],
   fileContents: Uint8Array[],
): Uint8Array => {
   const files = entries.filter((entry) => entry.kind === 'file');
   if (files.length !== fileContents.length) throw new Error('镜像文件数量不匹配');
   const seen = new Set<string>();
   for (const entry of entries) {
      if (!validPath(entry.path) || seen.has(entry.path)) throw new Error(`镜像路径无效：${entry.path}`);
      if (entry.kind === 'symlink' && !validLink(entry.path, entry.target)) throw new Error(`镜像软链接无效：${entry.path}`);
      seen.add(entry.path);
   }
   files.forEach((entry, i) => {
      if (entry.size !== fileContents[i]?.byteLength) throw new Error(`镜像文件大小不匹配：${entry.path}`);
   });
   const header = encoder.encode(JSON.stringify(entries));
   if (header.byteLength > MAX_HEADER_BYTES) throw new Error('镜像目录过大');
   const size = MAGIC.length + 4 + header.byteLength + fileContents.reduce((sum, bytes) => sum + bytes.byteLength, 0);
   const result = new Uint8Array(size);
   result.set(MAGIC);
   new DataView(result.buffer).setUint32(MAGIC.length, header.byteLength, true);
   result.set(header, MAGIC.length + 4);
   let offset = MAGIC.length + 4 + header.byteLength;
   for (const bytes of fileContents) {
      result.set(bytes, offset);
      offset += bytes.byteLength;
   }
   return result;
};

export const inspectVivariImage = (data: Uint8Array, totalSize = data.byteLength) => {
   if (data.byteLength < MAGIC.length + 4 || MAGIC.some((byte, i) => data[i] !== byte)) {
      throw new Error('不支持的快照镜像格式，请使用 Vivari 重新构建');
   }
   const headerLength = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(MAGIC.length, true);
   const start = MAGIC.length + 4;
   if (headerLength > MAX_HEADER_BYTES || start + headerLength > data.byteLength) throw new Error('镜像目录已损坏');
   const entries = JSON.parse(decoder.decode(data.subarray(start, start + headerLength))) as VivariImageEntry[];
   if (!Array.isArray(entries)) throw new Error('镜像目录无效');
   const seen = new Set<string>();
   let offset = start + headerLength;
   for (const entry of entries) {
      if (!entry || typeof entry.path !== 'string' || !validPath(entry.path) || seen.has(entry.path)) throw new Error('镜像路径无效或重复');
      if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) throw new Error('镜像权限无效');
      if (entry.kind !== 'file' && entry.kind !== 'directory' && entry.kind !== 'symlink') throw new Error('镜像条目类型无效');
      if (entry.kind === 'symlink' && (typeof entry.target !== 'string' || !validLink(entry.path, entry.target))) throw new Error('镜像软链接无效');
      seen.add(entry.path);
      if (entry.kind === 'file') {
         if (!Number.isSafeInteger(entry.size) || entry.size < 0 || offset + entry.size > totalSize) throw new Error('镜像文件长度无效');
         offset += entry.size;
      }
   }
   if (offset !== totalSize) throw new Error('镜像含有多余数据');
   return { entries, dataOffset: start + headerLength };
};

export const decodeVivariImage = (data: Uint8Array) => {
   const { entries, dataOffset } = inspectVivariImage(data);
   let offset = dataOffset;
   const files: Array<{ entry: Extract<VivariImageEntry, { kind: 'file' }>; bytes: Uint8Array }> = [];
   for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      files.push({ entry, bytes: data.subarray(offset, offset + entry.size) });
      offset += entry.size;
   }
   return { entries, files };
};
