import { useElementVisibility } from '@vueuse/core';
import {
   computed,
   nextTick,
   ref,
   toValue,
   watch,
   type MaybeRefOrGetter,
} from 'vue';

/**
 * 客户端分页 + 触底加载。
 *
 * 数据已经在本地（内容 store）时用它：默认先显示一页，底部哨兵进入视口再追加一页。
 * 用视口哨兵（IntersectionObserver）而不是给某个滚动元素绑 scroll，
 * 这样 window 滚动与内部 overflow 容器滚动都能正确触发。
 */
export const usePagedList = <T>(
   source: MaybeRefOrGetter<T[]>,
   pageSize = 10,
) => {
   const count = ref(pageSize);

   const items = computed(() => toValue(source).slice(0, count.value));
   const hasMore = computed(() => count.value < toValue(source).length);

   const sentinelRef = ref<HTMLElement | null>(null);
   const sentinelVisible = useElementVisibility(sentinelRef, {
      rootMargin: '400px 0px',
   });

   const loadMore = () => {
      if (!hasMore.value) return;
      count.value += pageSize;
   };

   watch(sentinelVisible, (visible) => {
      if (visible) loadMore();
   });

   // 追加后若哨兵仍在视口内（列表不足一屏），继续补足
   watch(items, () => {
      nextTick(() => {
         if (sentinelVisible.value) loadMore();
      });
   });

   // 数据源变化（切课程 / 专题）时回到第一页
   watch(
      () => toValue(source),
      () => {
         count.value = pageSize;
      },
   );

   return { items, hasMore, loadMore, sentinelRef };
};
