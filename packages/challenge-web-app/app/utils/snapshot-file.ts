import {
   decodeSnapshotContent,
   encodeSnapshotBytes,
   hasBinarySnapshotExtension,
} from '@challenge/shared/snapshot-content';

export const encodeSnapshotFile = (path: string, bytes: Uint8Array) =>
   encodeSnapshotBytes(bytes, hasBinarySnapshotExtension(path));

export const moveSnapshotFiles = <T extends { content: string }>(
   files: Record<string, T>,
   oldPath: string,
   newPath: string
) => {
   for (const [path, file] of Object.entries(files)) {
      if (path !== oldPath && !path.startsWith(`${oldPath}/`)) continue;
      const nextPath = newPath + path.slice(oldPath.length);
      const decoded = decodeSnapshotContent(path, file.content);
      const bytes = typeof decoded === 'string'
         ? new TextEncoder().encode(decoded)
         : decoded;
      files[nextPath] = { ...file, content: encodeSnapshotFile(nextPath, bytes) };
      delete files[path];
   }
};
