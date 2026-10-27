/** 二进制扩展名：快照里按 base64 存放。 */
export const BINARY_SNAPSHOT_EXTENSIONS: readonly string[] = [
   'png',
   'jpg',
   'jpeg',
   'gif',
   'bmp',
   'tiff',
   'webp',
   'ico',
   'cur',
];

const BINARY_SNAPSHOT_MIME_TYPES: Record<string, string> = {
   png: 'image/png',
   jpg: 'image/jpeg',
   jpeg: 'image/jpeg',
   gif: 'image/gif',
   bmp: 'image/bmp',
   tiff: 'image/tiff',
   webp: 'image/webp',
   ico: 'image/x-icon',
   cur: 'image/x-icon',
};

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export const isBase64Content = (content: string): boolean =>
   content.length > 0 &&
   content.length % 4 === 0 &&
   BASE64_PATTERN.test(content);

/** 宽松解析：容忍换行/空白、base64url 字符与缺失的补位；不是 base64 时返回 undefined */
export const normalizeBase64 = (content: string): string | undefined => {
   const compact = content
      .replace(/\s+/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/=+$/, '');
   if (compact.length === 0 || compact.length % 4 === 1) return undefined;
   if (!/^[A-Za-z0-9+/]+$/.test(compact)) return undefined;
   return compact.padEnd(Math.ceil(compact.length / 4) * 4, '=');
};

const getExtension = (filePath: string): string | undefined => {
   const fileName = filePath.split('/').pop() ?? filePath;
   const dotIndex = fileName.lastIndexOf('.');
   if (dotIndex <= 0) return undefined;
   return fileName.slice(dotIndex + 1).toLowerCase();
};

export const hasBinarySnapshotExtension = (filePath: string): boolean => {
   const extension = getExtension(filePath);
   return !!extension && BINARY_SNAPSHOT_EXTENSIONS.includes(extension);
};

/** 网页上传的 data URL 原样返回，CLI 上传的裸 base64 按扩展名补上 MIME；无法识别时返回 undefined */
export const toSnapshotDataUrl = (
   filePath: string,
   content: string
): string | undefined => {
   if (content.startsWith('data:')) return content;
   const mimeType = BINARY_SNAPSHOT_MIME_TYPES[getExtension(filePath) ?? ''];
   const base64 = mimeType ? normalizeBase64(content) : undefined;
   if (!base64) return undefined;
   // "data:" 的 base64 前缀：源文件本身就是 data URL 文本，被再套了一层 base64
   if (base64.startsWith('ZGF0YTp')) {
      const text = atob(base64).trim();
      if (text.startsWith('data:')) return text;
   }
   return `data:${mimeType};base64,${base64}`;
};

export const base64ToUint8Array = (base64: string): Uint8Array => {
   const binaryString = atob(base64);
   const bytes = new Uint8Array(binaryString.length);
   for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
   }
   return bytes;
};

/** data URL 与二进制扩展名的 base64 都解码为字节，其余按原样返回 */
export const decodeSnapshotContent = (
   filePath: string,
   content: string
): string | Uint8Array => {
   if (content.startsWith('data:')) {
      const commaIndex = content.indexOf(',');
      if (commaIndex < 0) return content;
      const meta = content.slice(5, commaIndex);
      const payload = content.slice(commaIndex + 1);
      if (!/;base64$/i.test(meta)) {
         try {
            return decodeURIComponent(payload);
         } catch {
            return payload;
         }
      }
      const base64 = normalizeBase64(payload);
      return base64 ? base64ToUint8Array(base64) : content;
   }
   if (hasBinarySnapshotExtension(filePath)) {
      const base64 = normalizeBase64(content);
      if (!base64) return content;
      const bytes = base64ToUint8Array(base64);
      // 源文件本身就是 data URL 文本时，解一层后得到的是 "data:..."，再按 data URL 解一次
      return startsWithDataUrl(bytes)
         ? decodeSnapshotContent(filePath, new TextDecoder().decode(bytes).trim())
         : bytes;
   }
   return content;
};

const DATA_URL_PREFIX = [0x64, 0x61, 0x74, 0x61, 0x3a];

export const startsWithDataUrl = (bytes: Uint8Array): boolean =>
   DATA_URL_PREFIX.every((byte, index) => bytes[index] === byte);
