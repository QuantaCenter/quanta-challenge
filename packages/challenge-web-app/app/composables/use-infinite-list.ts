import { useElementVisibility } from '@vueuse/core';
import type { ComputedRef, Ref } from 'vue';

/**
 * 一页数据。
 * `nextCursor` 为 null 表示没有下一页。
 */
export interface InfiniteListPage<TItem, TCursor> {
   items: TItem[];
   nextCursor: TCursor | null;
}

export interface UseInfiniteListOptions<TItem, TCursor> {
   /**
    * useAsyncData 的缓存 key，用于首屏 SSR 直出与 payload 复用，需在当前页面唯一。
    */
   key: string;
   /**
    * 每次请求的条数
    * @default 12
    */
   pageSize?: number;
   /**
    * 拉取一页数据，cursor 为 null 表示第一页。
    * 注意：筛选条件应在此函数内部实时读取，不要在外部提前求值。
    */
   fetchPage: (
      cursor: TCursor | null,
      limit: number,
   ) => Promise<InfiniteListPage<TItem, TCursor>>;
   /**
    * 提前加载的触发距离，哨兵进入视口前多少像素就开始加载下一页
    * @default '400px 0px'
    */
   rootMargin?: string;
}

export interface UseInfiniteListReturn<TItem, TCursor> {
   /** 已加载的全部数据（首页 + 后续追加页） */
   items: ComputedRef<TItem[]>;
   /** 首页请求状态 */
   status: Ref<'idle' | 'pending' | 'success' | 'error'>;
   /** 是否正在加载后续页 */
   loadingMore: Ref<boolean>;
   /** 是否还有下一页 */
   hasMore: ComputedRef<boolean>;
   /** 是否已全部加载完成（首页已返回且没有下一页） */
   allLoaded: ComputedRef<boolean>;
   /** 从第一页重新加载，筛选条件变化时调用 */
   refresh: () => Promise<void>;
   /** 手动加载下一页（想用「加载更多」按钮时可用） */
   loadMore: () => Promise<void>;
   /** 挂到列表底部的哨兵元素上，进入视口即自动加载下一页 */
   sentinelRef: Ref<HTMLElement | null>;
}

const DEFAULT_PAGE_SIZE = 12;

/**
 * 游标分页 + 触底自动加载。
 *
 * 首屏通过 useAsyncData 拉取以保证 SSR 直出；后续页在哨兵进入视口时追加。
 * 用视口哨兵（IntersectionObserver）而不是给某个滚动元素绑 scroll，
 * 这样 window 滚动与内部 overflow 容器滚动都能正确触发。
 */
export const useInfiniteList = <TItem, TCursor = number>(
   options: UseInfiniteListOptions<TItem, TCursor>,
): UseInfiniteListReturn<TItem, TCursor> => {
   const { key, fetchPage } = options;
   const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

   // 首屏数据，SSR 直出
   const {
      data: firstPage,
      status,
      refresh: refreshFirstPage,
   } = useAsyncData(key, () => fetchPage(null, pageSize));

   // 触底加载追加的后续页
   const restItems = ref<TItem[]>([]) as Ref<TItem[]>;
   const nextCursor = ref<TCursor | null>(null) as Ref<TCursor | null>;
   const loadingMore = ref(false);
   // 用于丢弃「筛选条件已变化」之后才返回的过期分页响应
   let loadToken = 0;

   const items = computed<TItem[]>(() => [
      ...(firstPage.value?.items ?? []),
      ...restItems.value,
   ]);

   const hasMore = computed(() => nextCursor.value !== null);
   const allLoaded = computed(
      () => status.value !== 'pending' && !hasMore.value,
   );

   const canLoadMore = () =>
      nextCursor.value !== null &&
      status.value !== 'pending' &&
      !loadingMore.value;

   const sentinelRef = ref<HTMLElement | null>(null);
   const sentinelVisible = useElementVisibility(sentinelRef, {
      rootMargin: options.rootMargin ?? '400px 0px',
   });

   const loadMore = async () => {
      const cursor = nextCursor.value;
      if (cursor === null || !canLoadMore()) return;

      const token = loadToken;
      let succeeded = false;
      loadingMore.value = true;
      try {
         const page = await fetchPage(cursor, pageSize);
         // 期间筛选条件已变化，丢弃这次结果
         if (token !== loadToken) return;
         restItems.value.push(...page.items);
         nextCursor.value = page.nextCursor;
         succeeded = true;
      } catch (error) {
         // 失败时不自动重试，避免哨兵可见时陷入错误循环
         console.error(`[${key}] 加载下一页失败:`, error);
      } finally {
         loadingMore.value = false;
      }

      // 追加后若哨兵仍在视口内（列表不足一屏），继续补足
      if (succeeded && token === loadToken && sentinelVisible.value) {
         nextTick(() => loadMore());
      }
   };

   const refresh = async () => {
      loadToken++;
      restItems.value = [];
      nextCursor.value = null;
      await refreshFirstPage();
   };

   watch(sentinelVisible, (visible) => {
      if (visible) void loadMore();
   });

   // 首页数据就绪后（含 SSR 水合）同步游标，并检查是否需要立刻续载
   watch(
      firstPage,
      (page) => {
         if (!page) return;
         restItems.value = [];
         nextCursor.value = page.nextCursor;
         nextTick(() => {
            if (sentinelVisible.value) void loadMore();
         });
      },
      { immediate: true },
   );

   return {
      items,
      status,
      loadingMore,
      hasMore,
      allLoaded,
      refresh,
      loadMore,
      sentinelRef,
   };
};
