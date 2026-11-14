import type { ISelectOption } from '~/components/st/Select/type';

/**
 * 快照镜像下拉选项：只有已就绪的 WebContainer 快照（formatVersion = 0）可以绑定。
 * 值为空字符串表示不使用快照镜像。
 */
export const useSnapshotImageOptions = (
   selectedId: () => string | null | undefined,
) => {
   const { $trpc } = useNuxtApp();
   type ImageBuildItem = Awaited<
      ReturnType<typeof $trpc.admin.imageBuild.list.query>
   >[number];

   const images = ref<ImageBuildItem[]>([]);
   const loading = ref(false);
   const loaded = ref(false);

   const refresh = async () => {
      loading.value = true;
      try {
         images.value = await $trpc.admin.imageBuild.list.query();
         loaded.value = true;
      } catch (error) {
         console.error('[workshop-template] 获取快照镜像列表失败:', error);
      } finally {
         loading.value = false;
      }
   };
   onMounted(refresh);

   const usable = (item: ImageBuildItem) =>
      item.status === 'ready' && item.formatVersion === 0;

   const options = computed<ISelectOption[]>(() => [
      { label: '不使用快照镜像', value: '' },
      ...images.value.filter(usable).map((item) => ({
         label: item.name,
         value: item.id,
         description: item.description || undefined,
      })),
   ]);

   const selectedName = computed(() => {
      const id = selectedId();
      if (!id) return '';
      return images.value.find((item) => item.id === id)?.name ?? id;
   });

   /** 已选的快照镜像不存在或不可用（列表加载完成后才判断） */
   const selectedUnavailable = computed(() => {
      const id = selectedId();
      return (
         !!id &&
         loaded.value &&
         !loading.value &&
         !images.value.some((item) => usable(item) && item.id === id)
      );
   });

   return { options, loading, refresh, selectedName, selectedUnavailable };
};
