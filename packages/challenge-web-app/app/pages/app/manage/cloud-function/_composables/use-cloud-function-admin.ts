import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';

/**
 * 云函数管理页的数据与操作。
 *
 * 把「列表 / API Key 列表」两次请求与启停、删除、撤销这些写操作从页面里抽出来，
 * 页面只负责把它们组进模板。
 */
export const useCloudFunctionAdmin = () => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();

   // ── 云函数列表 ───────────────────────────────────────────────────────────
   const {
      data: functions,
      pending: functionsPending,
      error: functionsError,
      refresh: refreshFunctions,
   } = useAsyncData('manage-cloud-functions', () =>
      $trpc.admin.cloudFunction.list.query({}),
   );

   watch(
      functionsError,
      (newError) => {
         if (newError) {
            logger.error(newError, '加载云函数列表失败');
            message.error('云函数加载失败', '请稍后重试');
         }
      },
      { immediate: true },
   );

   // 只有「第一次还没拿到数据」才显示骨架。refresh() 时旧数据还在，
   // 若把 pending 当 loading，表格会整块换成骨架，看起来就像被清空、闪一下。
   const functionsInitialLoading = computed(
      () => functionsPending.value && !functions.value,
   );

   const togglingName = ref<string | null>(null);
   const toggleEnabled = async (name: string, enabled: boolean) => {
      // 乐观更新：先本地翻转开关，等请求回来再 refresh 校准；失败则回滚。
      // 否则在请求 + 刷新的这段时间里，开关会先弹回旧值，看着像没生效。
      const row = functions.value?.find((item) => item.name === name);
      const previousEnabled = row?.enabled;
      if (row) row.enabled = enabled;

      togglingName.value = name;
      try {
         await $trpc.admin.cloudFunction.update.mutate({ name, enabled });
         message.success(enabled ? '已启用' : '已停用');
         await refreshFunctions();
      } catch (err) {
         if (row && previousEnabled !== undefined) {
            row.enabled = previousEnabled;
         }
         message.error('操作失败', (err as Error)?.message ?? '请稍后重试');
      } finally {
         togglingName.value = null;
      }
   };

   const removeFunction = async (name: string) => {
      const confirmed = await dialog.confirm({
         title: '删除云函数',
         description: `确定要删除「${name}」吗？所有版本与调用记录将一并移除，此操作不可撤销。`,
         variant: 'danger',
         confirmText: '删除',
         cancelText: '取消',
      });
      if (!confirmed) return;

      try {
         await $trpc.admin.cloudFunction.remove.mutate({ name, hard: true });
         message.success('删除成功');
         await refreshFunctions();
      } catch (err) {
         message.error('删除失败', (err as Error)?.message ?? '请稍后重试');
      }
   };

   // ── API Key 列表 ─────────────────────────────────────────────────────────
   const {
      data: keys,
      pending: keysPending,
      error: keysError,
      refresh: refreshKeys,
   } = useAsyncData('manage-cloud-function-keys', () =>
      $trpc.admin.cloudFunction.listKeys.query(),
   );

   watch(
      keysError,
      (newError) => {
         if (newError) {
            logger.error(newError, '加载 API Key 失败');
            message.error('API Key 加载失败', '请稍后重试');
         }
      },
      { immediate: true },
   );

   const keysInitialLoading = computed(
      () => keysPending.value && !keys.value,
   );

   const revokeKey = async (keyId: string, name: string) => {
      const confirmed = await dialog.confirm({
         title: '撤销 API Key',
         description: `撤销「${name}」后，使用该 Key 的调用将立即失败，此操作不可撤销。`,
         variant: 'danger',
         confirmText: '撤销',
         cancelText: '取消',
      });
      if (!confirmed) return;

      try {
         await $trpc.admin.cloudFunction.revokeKey.mutate({ keyId });
         message.success('已撤销');
         await refreshKeys();
      } catch (err) {
         message.error('撤销失败', (err as Error)?.message ?? '请稍后重试');
      }
   };

   return {
      functions,
      functionsInitialLoading,
      refreshFunctions,
      keys,
      keysInitialLoading,
      refreshKeys,
      togglingName,
      toggleEnabled,
      removeFunction,
      revokeKey,
   };
};
