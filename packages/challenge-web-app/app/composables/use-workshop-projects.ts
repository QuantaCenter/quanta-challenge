import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';

type RouterOutput = inferRouterOutputs<AppRouter>;

/** 工坊「我的项目」列表项 */
export type WorkshopProject = RouterOutput['protected']['workshop']['list'][number];

/** 工坊可用模板（不含文件内容，文件在详情弹窗中按需加载） */
export type WorkshopTemplateItem = RouterOutput['protected']['workshop']['templates'][number];

/**
 * 工坊「我的项目」：列表数据 + 重命名 / 删除操作（含确认弹窗与提示）。
 * 必须同步调用（inject 依赖 setup 的实例上下文）；需要等待首屏数据时 `await ready`。
 */
export const useWorkshopProjects = () => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();

   const asyncData = useAsyncData('workshop-projects', () =>
      $trpc.protected.workshop.list.query(),
   );
   const { data: projects, pending, error, refresh } = asyncData;

   // Schedule after each request finishes, so slow requests never overlap.
   let pollTimer: ReturnType<typeof setTimeout> | undefined;
   let disposed = false;
   const hasImports = computed(() => projects.value?.some(project => project.importStatus === 'importing') ?? false);
   const schedulePoll = () => {
      clearTimeout(pollTimer);
      if (disposed || !hasImports.value) return;
      pollTimer = setTimeout(async () => {
         try {
            const latest = await $trpc.protected.workshop.list.query();
            if (!disposed) projects.value = latest;
         } catch {
            // Keep the visible projects and retry after a transient polling failure.
         } finally {
            schedulePoll();
         }
      }, 3000);
   };
   if (import.meta.client) {
      watch(hasImports, schedulePoll, { immediate: true });
      onScopeDispose(() => {
         disposed = true;
         clearTimeout(pollTimer);
      });
   }

   const renameProject = async (project: WorkshopProject) => {
      const name = await dialog.prompt({
         title: '重命名项目',
         defaultValue: project.name,
         placeholder: '项目名称',
         maxLength: 40,
         validator: (value) => value.trim().length > 0 || '项目名称不能为空',
         confirmText: '保存',
      });
      if (name === null || name.trim() === project.name) return;
      try {
         await $trpc.protected.workshop.update.mutate({
            id: project.id,
            name: name.trim(),
         });
         await refresh();
      } catch (error: any) {
         message.error('重命名失败', error?.message ?? String(error));
      }
   };

   const deleteProject = async (project: WorkshopProject) => {
      const confirmed = await dialog.confirm({
         title: `删除「${project.name}」？`,
         description:
            '项目中的所有文件（包括上传的文件）都会被永久删除，且无法恢复。',
         variant: 'danger',
         confirmText: '删除',
      });
      if (!confirmed) return;
      try {
         await $trpc.protected.workshop.delete.mutate({ id: project.id });
         message.success('项目已删除');
         await refresh();
      } catch (error: any) {
         message.error('删除失败', error?.message ?? String(error));
      }
   };

   return {
      projects,
      pending,
      error,
      refresh,
      ready: asyncData.then(() => undefined),
      renameProject,
      deleteProject,
   };
};
