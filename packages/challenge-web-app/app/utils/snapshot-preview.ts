import {
   decodeSnapshotContent,
   toSnapshotDataUrl,
} from '@challenge/shared/snapshot-content';

const imageType = (bytes: Uint8Array): string | undefined => {
   const prefix = (...values: number[]) =>
      values.every((value, index) => bytes[index] === value);
   if (prefix(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
      return 'image/png';
   }
   if (prefix(0xff, 0xd8, 0xff)) return 'image/jpeg';
   if (prefix(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
   if (prefix(0x42, 0x4d)) return 'image/bmp';
   if (prefix(0x49, 0x49, 0x2a, 0) || prefix(0x4d, 0x4d, 0, 0x2a)) {
      return 'image/tiff';
   }
   if (prefix(0, 0, 1, 0) || prefix(0, 0, 2, 0)) return 'image/x-icon';
   if (
      prefix(0x52, 0x49, 0x46, 0x46) &&
      bytes[8] === 0x57 && bytes[9] === 0x45 &&
      bytes[10] === 0x42 && bytes[11] === 0x50
   ) {
      return 'image/webp';
   }
   return undefined;
};

export const snapshotBinaryBytes = (path: string, content?: string) => {
   if (content === undefined) return undefined;
   const decoded = decodeSnapshotContent(path, content);
   return decoded instanceof Uint8Array ? decoded : undefined;
};

export const snapshotDownloadUrl = (path: string, content?: string) => {
   if (content === undefined || !snapshotBinaryBytes(path, content)) {
      return undefined;
   }
   return toSnapshotDataUrl(path, content);
};

export const snapshotImageUrl = (path: string, content?: string) => {
   const url = snapshotDownloadUrl(path, content);
   const bytes = snapshotBinaryBytes(path, content);
   if (!url || !bytes) return undefined;
   const mime = imageType(bytes);
   return mime ? url.replace(/^data:[^;,]*/i, `data:${mime}`) : undefined;
};
