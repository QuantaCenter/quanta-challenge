import { useMessage } from '~/components/st/Message/use-message';
import { DEFAULT_FILE_SYSTEM_SYNC_INTERVAL } from '../_configs';
import { minimatch } from 'minimatch';
import { normalizePath } from '~/utils/path-utils';
import { takeFileSyncBatch, type FileSyncChange } from '~~/shared/file-sync';

export interface IUseFileChangeSyncOptions {
   /** 做题项目的题目 id；传入 send 时可省略 */
   problemId?: number;
   ignorePatterns?: string[];
   syncInterval?: number;
   /** 返回加载项目时的版本号，随同步请求携带，供服务端拒绝重置前发出的旧请求 */
   getRevision?: () => number | undefined;
   /** 自定义同步请求（如工坊项目），默认同步到做题项目 */
   send?: (
      changes: Change[],
      revision: number | undefined,
   ) => Promise<{ processedCount: number }>;
   /** 版本冲突（项目已被重置）时的提示 */
   conflictMessage?: string;
}

export type Change = FileSyncChange;

/**
 * 监听文件系统变化，同步到云端
 */
export const useFileChangeSync = (options: IUseFileChangeSyncOptions) => {
   const {
      problemId,
      ignorePatterns = [],
      syncInterval = DEFAULT_FILE_SYSTEM_SYNC_INTERVAL,
      getRevision,
      conflictMessage = '题目已被重置，本地未同步的修改已丢弃，请刷新页面',
   } = options;
   const { $trpc } = useNuxtApp();
   const maxChanges = useRuntimeConfig().public.fileSync.maxChangesPerSync;
   const send =
      options.send ??
      ((changes: Change[], revision: number | undefined) =>
         $trpc.protected.fileSync.syncFileChanges.mutate({
            problemId: problemId!,
            changes,
            revision,
         }));
   const changeList: Change[] = [];

   const isIgnored = (path: string) => {
      return ignorePatterns.some((pattern) => minimatch(path, pattern));
   };

   const rm = (path: string) => {
      const normalizedPath = normalizePath(path);
      !isIgnored(normalizedPath) &&
         changeList.push({ type: 'rm', path: normalizedPath });
   };

   const mv = (oldPath: string, newPath: string) => {
      const normalizedOldPath = normalizePath(oldPath);
      const normalizedNewPath = normalizePath(newPath);
      !isIgnored(normalizedNewPath) &&
         changeList.push({
            type: 'mv',
            oldPath: normalizedOldPath,
            newPath: normalizedNewPath,
         });
   };

   const change = (path: string, value: string) => {
      const normalizedPath = normalizePath(path);
      const existingChange = changeList.find(
         (c) => c.type === 'change' && c.path === normalizedPath
      );

      if (!existingChange) {
         !isIgnored(normalizedPath) &&
            changeList.push({
               type: 'change',
               path: normalizedPath,
               content: value,
            });
      } else if (existingChange.type === 'change') {
         existingChange.content = value;
      } else {
         console.error(
            '[ERROR] Inconsistent change type detected:',
            existingChange
         );
      }
   };

   const create = (path: string, content: string) => {
      const normalizedPath = normalizePath(path);

      if (isIgnored(normalizedPath)) return;

      // 检查是否已经存在相同路径的 create 或 change 操作
      const existingChange = changeList.find(
         (c) =>
            (c.type === 'create' || c.type === 'change') &&
            c.path === normalizedPath
      );

      if (!existingChange) {
         changeList.push({ type: 'create', path: normalizedPath, content });
      } else if (
         existingChange.type === 'create' ||
         existingChange.type === 'change'
      ) {
         // 如果已经存在，更新内容
         existingChange.content = content;
      }
   };

   let failedTime = 0;
   const maxFailedTime = 5;
   const message = useMessage();

   // 同步状态
   const lastSyncTime = ref<Date | null>(null);
   const isSyncing = ref(false);
   const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle');

   let statusTimer: ReturnType<typeof setTimeout> | null = null;

   const syncChangeToServer = async (changes: Change[]) => {
      const pending = [...changes];
      let batch: Change[] = [];
      const revision = getRevision?.();
      const sendBatches = async () => {
         let processedCount = 0;
         while (pending.length) {
            batch = takeFileSyncBatch(pending, maxChanges);
            const result = await send(batch, revision);
            processedCount += result.processedCount;
            pending.splice(0, batch.length);
         }
         return processedCount;
      };
      // 清除之前的状态恢复定时器
      if (statusTimer) {
         clearTimeout(statusTimer);
         statusTimer = null;
      }

      isSyncing.value = true;
      syncStatus.value = 'syncing';

      try {
         const processedCount = await atLeastTime(1000, sendBatches());
         console.info(
            `[SYNC] Successfully synced ${processedCount} changes to server`
         );
         failedTime = 0;
         lastSyncTime.value = new Date();
         syncStatus.value = 'success';

         // 成功状态保持 3 秒
         statusTimer = setTimeout(() => {
            if (syncStatus.value === 'success') {
               syncStatus.value = 'idle';
            }
         }, 3000);
      } catch (error) {
         const code = (error as { data?: { code?: string } })?.data?.code;
         if (code === 'CONFLICT') {
            // 变更基于旧版本，重新入队只会无限失败，丢弃并停止自动同步
            console.warn('[SYNC] Project revision mismatch, discarding stale changes');
            message.error(conflictMessage);
            syncStatus.value = 'error';
            failedTime = maxFailedTime;

            // 错误状态保持 5 秒
            statusTimer = setTimeout(() => {
               if (syncStatus.value === 'error') {
                  syncStatus.value = 'idle';
               }
            }, 5000);
            return;
         }
         if (code === 'BAD_REQUEST' || code === 'PAYLOAD_TOO_LARGE') {
            // Only discard the rejected batch; later operations were never sent.
            changeList.unshift(...pending.slice(batch.length));
            // 服务端拒绝的变更（非法内容、超出空间配额）重试也不会通过，直接丢弃
            console.warn('[SYNC] Changes rejected by server, discarding');
            message.error(
               code === 'PAYLOAD_TOO_LARGE'
                  ? ((error as Error).message || '文件超出空间限制，已跳过同步')
                  : '部分文件变更被拒绝，已跳过'
            );
            syncStatus.value = 'error';

            // 错误状态保持 5 秒
            statusTimer = setTimeout(() => {
               if (syncStatus.value === 'error') {
                  syncStatus.value = 'idle';
               }
            }, 5000);
            return;
         }

         failedTime++;
         changeList.unshift(...pending);
         console.error('[SYNC ERROR]', error);
         message.error('同步文件变化到服务器失败，请检查网络连接');
         syncStatus.value = 'error';

         // 错误状态保持 5 秒
         statusTimer = setTimeout(() => {
            if (syncStatus.value === 'error') {
               syncStatus.value = 'idle';
            }
         }, 5000);
      } finally {
         isSyncing.value = false;
      }
   };

   let currentSync: Promise<void> | undefined;
   const forceSync = async () => {
      while (currentSync) await currentSync;
      if (changeList.length === 0) return;
      const changesToSync = [...changeList];
      changeList.length = 0;

      // 调用同步函数
      currentSync = syncChangeToServer(changesToSync);
      try {
         await currentSync;
      } finally {
         currentSync = undefined;
      }
   };

   let alive = true;
   const startSync = () => {
      setTimeout(async () => {
         if (!alive) return;
         if (changeList.length === 0) {
            startSync();
            return;
         }

         await forceSync();

         // 继续下一个周期的同步
         if (failedTime < maxFailedTime) {
            alive && startSync();
         } else {
            message.error('多次同步失败，已停止自动同步，请检查网络连接');
         }
      }, syncInterval);
   };

   onMounted(() => {
      alive = true;
      startSync();
   });

   onUnmounted(() => {
      alive = false;
   });

   return {
      rm,
      mv,
      change,
      create,
      forceSync,
      lastSyncTime: readonly(lastSyncTime),
      isSyncing: readonly(isSyncing),
      syncStatus: readonly(syncStatus),
   };
};
