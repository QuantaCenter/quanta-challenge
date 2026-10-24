import type { SearchResult, SearchType } from '~/types/search';
import { SEARCH_CONSTANTS, SEARCH_LIMITS } from '@challenge/shared/config';

/**
 * 全局搜索状态管理
 */
export const useSearch = () => {
   const isSearchOpen = useState('search-overlay-open', () => false);

   const openSearch = () => {
      isSearchOpen.value = true;
   };

   const closeSearch = () => {
      isSearchOpen.value = false;
   };

   const toggleSearch = () => {
      isSearchOpen.value = !isSearchOpen.value;
   };

   // 搜索关键词
   const searchQuery = useState('search-query', () => '');

   // 搜索类型过滤
   const searchTypes = useState<SearchType[]>('search-types', () => []);

   // 搜索结果
   const searchResults = useState<SearchResult[]>('search-results', () => []);

   // 是否正在搜索
   const isSearching = useState('is-searching', () => false);

   // 是否正在加载更多
   const isLoadingMore = useState('search-loading-more', () => false);

   // 是否还有更多结果
   const hasMoreResults = useState('search-has-more', () => false);

   // 用于取消过期请求，避免快速输入时旧结果覆盖新结果
   let abortController: AbortController | null = null;
   let currentOffset = 0;

   /**
    * 执行搜索
    * @param query 搜索关键词
    * @param options.append 是否追加到现有结果（加载更多）
    */
   const performSearch = async (
      query: string,
      options?: { append?: boolean }
   ) => {
      const trimmed = query.trim();
      if (!trimmed) {
         searchResults.value = [];
         hasMoreResults.value = false;
         return;
      }

      // 取消上一次未完成的请求
      abortController?.abort();
      const controller = new AbortController();
      abortController = controller;

      const append = options?.append ?? false;
      if (!append) {
         currentOffset = 0;
         searchResults.value = [];
      }
      isSearching.value = !append;
      if (append) isLoadingMore.value = true;
      searchQuery.value = trimmed;

      try {
         const { $trpc } = useNuxtApp();
         // 构造搜索类型参数
         const typeParam =
            searchTypes.value.length === 0
               ? 'all'
               : searchTypes.value.join(',');

         const response = await atLeastTime(
            SEARCH_CONSTANTS.DEBOUNCE_DELAY,
            $trpc.protected.search.search.query(
               {
                  q: trimmed,
                  type: typeParam as any,
                  limit: SEARCH_LIMITS.DEFAULT_LIMIT,
                  offset: currentOffset,
               },
               { signal: controller.signal }
            )
         );

         // 请求已被更新的搜索取代，丢弃结果
         if (controller.signal.aborted) return;

         searchResults.value = append
            ? [...searchResults.value, ...response.results]
            : response.results;
         hasMoreResults.value = response.hasMore;
         currentOffset += SEARCH_LIMITS.DEFAULT_LIMIT;
      } catch (error) {
         // 请求被新搜索取消，忽略错误
         if (controller.signal.aborted) return;

         console.error('搜索失败:', error);
         if (!append) searchResults.value = [];
      } finally {
         if (abortController === controller) {
            isSearching.value = false;
            isLoadingMore.value = false;
         }
      }
   };

   return {
      isSearchOpen,
      openSearch,
      closeSearch,
      toggleSearch,
      searchQuery,
      searchTypes,
      searchResults,
      isSearching,
      isLoadingMore,
      hasMoreResults,
      performSearch,
   };
};
