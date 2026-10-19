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

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export const isBase64Content = (content: string): boolean =>
   content.length > 0 &&
   content.length % 4 === 0 &&
   BASE64_PATTERN.test(content);

export const hasBinarySnapshotExtension = (filePath: string): boolean => {
   const fileName = filePath.split('/').pop() ?? filePath;
   const dotIndex = fileName.lastIndexOf('.');
   if (dotIndex <= 0) return false;
   const extension = fileName.slice(dotIndex + 1).toLowerCase();
   return BINARY_SNAPSHOT_EXTENSIONS.includes(extension);
};

export const base64ToUint8Array = (base64: string): Uint8Array => {
   const binaryString = atob(base64);
   const bytes = new Uint8Array(binaryString.length);
   for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
   }
   return bytes;
};

/** data URL 与二进制扩展名的裸 base64 都解码为字节，其余按原样返回 */
export const decodeSnapshotContent = (
   filePath: string,
   content: string
): string | Uint8Array => {
   if (content.startsWith('data:')) {
      const commaIndex = content.indexOf(',');
      if (commaIndex < 0) return content;
      return base64ToUint8Array(content.slice(commaIndex + 1));
   }
   if (hasBinarySnapshotExtension(filePath) && isBase64Content(content)) {
      return base64ToUint8Array(content);
   }
   return content;
};
