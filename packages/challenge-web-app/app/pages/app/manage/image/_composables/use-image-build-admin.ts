import { h } from 'vue';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';

/** 构建页依赖跨源隔离响应头，需整页加载 */
export const openImageBuildEditor = (id?: string) =>
   navigateTo(id ? `/app/publish/image?id=${encodeURIComponent(id)}` : '/app/publish/image', {
      external: true,
   });

/** 快照镜像管理：列表、详情与删除 */
export const useImageBuildAdmin = () => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();

   const {
      data: builds,
      pending,
      error,
      refresh,
   } = useAsyncData('manage-image-builds', () => $trpc.admin.imageBuild.list.query());

   watch(
      error,
      (newError) => {
         if (newError) {
            logger.error(newError, '加载快照镜像列表失败');
            message.error('快照镜像加载失败', '请稍后重试');
         }
      },
      { immediate: true },
   );

   const initialLoading = computed(() => pending.value && !builds.value);

   const removingId = ref<string | null>(null);

   const removeBuild = async (id: string, name: string) => {
      if (removingId.value) return false;
      removingId.value = id;
      try {
         const detail = await $trpc.admin.imageBuild.detail.query({ id });
         const references = detail.references;

         const confirmed = await dialog.confirm(
            references.length === 0
               ? {
                    title: '删除快照镜像',
                    description: `确定要删除快照镜像「${name}」吗？产物文件会一并删除，此操作不可撤销。`,
                    variant: 'danger',
                    confirmText: '删除',
                    cancelText: '取消',
                 }
               : {
                    title: `快照镜像「${name}」正在被使用`,
                    content: () =>
                       h('div', { class: 'space-y-3 st-font-body-normal text-accent-300' }, [
                          h('p', [
                             '以下 ',
                             h('span', { class: 'text-error font-bold' }, String(references.length)),
                             ' 道题目正在使用该快照镜像：',
                          ]),
                          h(
                             'ul',
                             {
                                class: 'max-h-48 overflow-auto rounded-lg bg-accent-700 p-3 space-y-1.5',
                             },
                             references.map((item) =>
                                h('li', { class: 'flex items-center gap-2 min-w-0' }, [
                                   h(
                                      'span',
                                      { class: 'shrink-0 font-mono st-font-caption text-accent-400' },
                                      `#${item.pid}`,
                                   ),
                                   h('span', { class: 'truncate text-accent-100' }, item.title),
                                ]),
                             ),
                          ),
                          h(
                             'p',
                             '强制删除后，这些题目会改为不使用快照镜像（做题页不再挂载快照，判题不受影响），此操作不可撤销。',
                          ),
                       ]),
                    variant: 'danger',
                    confirmText: `强制删除并解除 ${references.length} 道题目`,
                    cancelText: '取消',
                 },
         );
         if (!confirmed) return false;

         const result = await $trpc.admin.imageBuild.remove.mutate({
            id,
            force: references.length > 0,
         });
         message.success(
            '快照镜像已删除',
            result.detachedCount
               ? `${result.detachedCount} 个题目版本已改为不使用快照镜像`
               : undefined,
         );
         await refresh();
         return true;
      } catch (err) {
         message.error('删除失败', (err as Error)?.message ?? '请稍后重试');
         return false;
      } finally {
         removingId.value = null;
      }
   };

   return { builds, initialLoading, refresh, removingId, removeBuild };
};

export type ImageBuildRow = NonNullable<
   ReturnType<typeof useImageBuildAdmin>['builds']['value']
>[number];
