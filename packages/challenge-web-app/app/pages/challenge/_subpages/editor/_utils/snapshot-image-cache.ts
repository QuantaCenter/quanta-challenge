/**
 * 快照镜像的 IndexedDB 缓存，以 fileName 为键。
 * fileName 随每次上传变化、内容不可变，命中即为最新版本。
 * 所有操作失败都只返回空结果或静默跳过，调用方回退到网络下载。
 */

const DB_NAME = 'quanta-snapshot-images';
const STORE_NAME = 'images';
const MAX_ENTRIES = 3;

interface ICachedSnapshotImage {
   fileName: string;
   imageId: string;
   blob: Blob;
   size: number;
   lastUsedAt: number;
}

let dbPromise: Promise<IDBDatabase> | undefined;

const requestDb = (version?: number) =>
   new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, version);
      request.onupgradeneeded = () => {
         const db = request.result;
         if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
         }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB open blocked'));
   });

const openDb = () => {
   if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available'));
   }
   dbPromise ??= (async () => {
      let db = await requestDb();
      // 库已存在但缺少 store 时不会触发 upgradeneeded，需升版本补建
      if (!db.objectStoreNames.contains(STORE_NAME)) {
         const nextVersion = db.version + 1;
         db.close();
         db = await requestDb(nextVersion);
      }
      db.onversionchange = () => {
         db.close();
         dbPromise = undefined;
      };
      return db;
   })().catch((error) => {
      dbPromise = undefined;
      throw error;
   });
   return dbPromise;
};

const runTransaction = async (
   mode: IDBTransactionMode,
   run: (store: IDBObjectStore) => void,
) => {
   const db = await openDb();
   await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
      run(tx.objectStore(STORE_NAME));
   });
};

/** 读取缓存并刷新最近使用时间；未命中或出错时返回 null */
export const readCachedSnapshotImage = async (
   fileName: string,
): Promise<Uint8Array<ArrayBuffer> | null> => {
   try {
      let blob: Blob | undefined;
      await runTransaction('readwrite', (store) => {
         const request = store.get(fileName);
         request.onsuccess = () => {
            const entry = request.result as ICachedSnapshotImage | undefined;
            if (!entry) return;
            blob = entry.blob;
            store.put({ ...entry, lastUsedAt: Date.now() });
         };
      });
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
   } catch (error) {
      console.warn('[snapshot-cache] 读取缓存失败:', error);
      return null;
   }
};

/** 写入缓存，并清理同一镜像的旧版本与超出数量上限的条目 */
export const writeCachedSnapshotImage = (
   imageId: string,
   fileName: string,
   blob: Blob,
): Promise<void> => {
   const entry: ICachedSnapshotImage = {
      fileName,
      imageId,
      blob,
      size: blob.size,
      lastUsedAt: Date.now(),
   };
   return runTransaction('readwrite', (store) => {
      store.put(entry);
      const request = store.getAll();
      request.onsuccess = () => {
         const entries = (request.result as ICachedSnapshotImage[]).sort(
            (a, b) => b.lastUsedAt - a.lastUsedAt,
         );
         let others = 0;
         for (const item of entries) {
            if (item.fileName === fileName) continue;
            if (item.imageId === imageId || ++others >= MAX_ENTRIES) {
               store.delete(item.fileName);
            }
         }
      };
   }).catch((error) => {
      console.warn('[snapshot-cache] 写入缓存失败:', error);
   });
};

export const deleteCachedSnapshotImage = (fileName: string): Promise<void> =>
   runTransaction('readwrite', (store) => {
      store.delete(fileName);
   }).catch((error) => {
      console.warn('[snapshot-cache] 删除缓存失败:', error);
   });
