import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';
import { logger } from '~~/lib/logger';

/** 发布 / 编辑自定义模板的页面地址 */
export const customTemplateEditorUrl = (id?: string) =>
   id
      ? `/app/publish/workshop-template?id=${encodeURIComponent(id)}`
      : '/app/publish/workshop-template';

/** 工坊模板管理：列表、启用 / 停用、恢复默认与删除 */
export const useWorkshopTemplateAdmin = () => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();

   const {
      data: templates,
      pending,
      error,
      refresh,
   } = useAsyncData('manage-workshop-templates', () =>
      $trpc.admin.workshopTemplate.list.query(),
   );

   watch(
      error,
      (newError) => {
         if (newError) {
            logger.error(newError, '加载工坊模板列表失败');
            message.error('工坊模板加载失败', '请稍后重试');
         }
      },
      { immediate: true },
   );

   const initialLoading = computed(() => pending.value && !templates.value);

   /** 正在处理的模板 id（启停 / 恢复默认 / 删除），用于禁用对应操作 */
   const busyId = ref<string | null>(null);

   const runExclusive = async (id: string, task: () => Promise<void>) => {
      if (busyId.value) return;
      busyId.value = id;
      try {
         await task();
      } finally {
         busyId.value = null;
      }
   };

   const toggle = (row: WorkshopTemplateRow, enabled: boolean) =>
      runExclusive(row.id, async () => {
         if (!enabled) {
            const confirmed = await dialog.confirm({
               title: `停用模板「${row.name}」？`,
               description: row.projectCount
                  ? `停用后工坊中不再展示该模板，用户也无法再从它创建项目；已创建的 ${row.projectCount} 个项目不受影响，仍可正常打开与重置。`
                  : '停用后工坊中不再展示该模板，用户也无法再从它创建项目。',
               confirmText: '停用',
               cancelText: '取消',
            });
            if (!confirmed) return;
         }
         try {
            await $trpc.admin.workshopTemplate.setEnabled.mutate({ id: row.id, enabled });
            message.success(enabled ? '模板已启用' : '模板已停用');
            await refresh();
         } catch (err) {
            message.error('操作失败', (err as Error)?.message ?? '请稍后重试');
         }
      });

   const resetBuiltin = (row: WorkshopTemplateRow) =>
      runExclusive(row.id, async () => {
         const confirmed = await dialog.confirm({
            title: `恢复「${row.name}」的默认配置？`,
            description:
               '名称、简介、安装 / 启动命令将恢复为系统默认值，并解除快照镜像绑定；启用状态保持不变。',
            confirmText: '恢复默认',
            cancelText: '取消',
         });
         if (!confirmed) return;
         try {
            await $trpc.admin.workshopTemplate.resetBuiltin.mutate({ id: row.id });
            message.success('已恢复默认配置');
            await refresh();
         } catch (err) {
            message.error('恢复失败', (err as Error)?.message ?? '请稍后重试');
         }
      });

   const remove = (row: WorkshopTemplateRow) =>
      runExclusive(row.id, async () => {
         const confirmed = await dialog.confirm({
            title: `删除模板「${row.name}」？`,
            description: row.projectCount
               ? `已有 ${row.projectCount} 个项目使用该模板：项目会保留，但将无法再重置为模板初始文件，启动方式改为按项目内容推断。如只是暂时下线，建议改为停用。此操作不可撤销。`
               : '模板的文件与配置会被永久删除，此操作不可撤销。',
            variant: 'danger',
            confirmText: '删除',
            cancelText: '取消',
         });
         if (!confirmed) return;
         try {
            await $trpc.admin.workshopTemplate.remove.mutate({ id: row.id });
            message.success('模板已删除');
            await refresh();
         } catch (err) {
            message.error('删除失败', (err as Error)?.message ?? '请稍后重试');
         }
      });

   return {
      templates,
      initialLoading,
      refresh,
      busyId,
      toggle,
      resetBuiltin,
      remove,
   };
};

export type WorkshopTemplateRow =
   inferRouterOutputs<AppRouter>['admin']['workshopTemplate']['list'][number];
