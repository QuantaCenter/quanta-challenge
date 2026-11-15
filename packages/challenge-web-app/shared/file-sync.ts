export const DEFAULT_FILE_SYNC_MAX_CHANGES = 50;
export const FILE_SYNC_BATCH_BYTES = 1024 * 1024;
// A supported 20 MB text file can expand sixfold when JSON-escaped.
export const FILE_SYNC_MAX_REQUEST_BYTES = 128 * 1024 * 1024;

export type FileSyncChange =
   | { type: 'rm'; path: string }
   | { type: 'mv'; oldPath: string; newPath: string }
   | { type: 'change'; path: string; content: string }
   | { type: 'create'; path: string; content: string };

/** Keep operations ordered; a large individual file travels in its own request. */
export const takeFileSyncBatch = (
   changes: FileSyncChange[],
   maxChanges = DEFAULT_FILE_SYNC_MAX_CHANGES,
   maxBytes = FILE_SYNC_BATCH_BYTES,
) => {
   const encoder = new TextEncoder();
   let bytes = 1024; // Reserve space for the tRPC input envelope and identifiers.
   let count = 0;
   for (const change of changes) {
      const size = encoder.encode(JSON.stringify(change)).byteLength + 1;
      if (count && (count >= Math.max(1, maxChanges) || bytes + size > maxBytes)) break;
      bytes += size;
      count++;
   }
   return changes.slice(0, count);
};
