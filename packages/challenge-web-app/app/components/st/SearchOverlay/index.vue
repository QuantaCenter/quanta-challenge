<script setup lang="ts">
import type { StSearchOverlayRecentAndQuickAccess } from '#components';
import { Search, Close, LoadingFour } from '@icon-park/vue-next';
import {
   CalendarThirtyTwo,
   ListView,
   TagOne,
   User,
   WebPage,
   GoldMedalTwo,
   VolumeNotice,
   History,
   Help,
   Code,
} from '@icon-park/vue-next';
import type { SearchResult, SearchResultType } from '~/types/search';
import {
   SEARCH_TYPE_CONFIGS,
   SEARCH_CONSTANTS,
   type SearchTypeConfig,
} from '@challenge/shared/config';

const {
   isSearchOpen,
   closeSearch,
   searchQuery,
   searchTypes,
   searchResults,
   isSearching,
   isLoadingMore,
   hasMoreResults,
   performSearch,
} = useSearch();

// 加载更多结果
const loadMore = () => {
   performSearch(localQuery.value, { append: true });
};

// 图标映射
const ICON_MAP = {
   ListView,
   CalendarThirtyTwo,
   User,
   TagOne,
   WebPage,
   GoldMedalTwo,
   VolumeNotice,
   History,
   Help,
   Code,
} as const;

// 类型标签配置 - 从统一配置生成
const typeLabels = Object.fromEntries(
   Object.values(SEARCH_TYPE_CONFIGS).map((config: SearchTypeConfig) => [
      config.value,
      {
         label: config.label,
         icon: ICON_MAP[config.icon as keyof typeof ICON_MAP],
         order: config.order,
      },
   ])
) as Record<SearchResultType, { label: string; icon: any; order: number }>;

// 按类型分组搜索结果
const groupedResults = computed(() => {
   const groups = new Map<SearchResultType, SearchResult[]>();

   searchResults.value.forEach((result) => {
      if (!groups.has(result.type)) {
         groups.set(result.type, []);
      }
      groups.get(result.type)!.push(result);
   });

   // 按预定义顺序排序
   return Array.from(groups.entries())
      .sort((a, b) => typeLabels[a[0]].order - typeLabels[b[0]].order)
      .map(([type, results]) => ({
         type,
         label: typeLabels[type].label,
         icon: typeLabels[type].icon,
         results,
      }));
});

// 计算结果在全局列表中的索引（用于键盘导航）
const getGlobalIndex = (groupIndex: number, resultIndex: number) => {
   let globalIndex = 0;
   for (let i = 0; i < groupIndex; i++) {
      const group = groupedResults.value[i];
      if (group) {
         globalIndex += group.results.length;
      }
   }
   return globalIndex + resultIndex;
};

// 保存搜索历史
const saveSearch = (query: string) => {
   if (!query.trim()) return;

   try {
      const stored = localStorage.getItem(SEARCH_CONSTANTS.RECENT_SEARCH_KEY);
      const searches = stored ? JSON.parse(stored) : [];
      const filtered = searches.filter((s: string) => s !== query);
      filtered.unshift(query);
      const updated = filtered.slice(0, SEARCH_CONSTANTS.MAX_RECENT_SEARCHES);
      localStorage.setItem(
         SEARCH_CONSTANTS.RECENT_SEARCH_KEY,
         JSON.stringify(updated)
      );
   } catch (error) {
      console.error('保存搜索历史失败:', error);
   }
};

const inputRef = ref<HTMLInputElement>();
const recentAccessRef =
   ref<InstanceType<typeof StSearchOverlayRecentAndQuickAccess>>();
const localQuery = ref('');
const selectedIndex = ref(-1); // 当前选中的结果索引
const resultsContainerRef = ref<HTMLElement>(); // 结果列表容器
const contentRef = ref<HTMLElement>(); // 内容区域引用

// 使用动态高度 composable
const { containerHeight, BOTTOM_FIXED_HEIGHT, updateHeight } = useDynamicHeight(
   {
      contentRef,
      watchSources: [isSearching, searchResults, localQuery],
      bottomFixedHeight: 62,
      maxHeight: 500,
      initialHeight: 400,
      extraPadding: 10,
   }
);

// 升级防抖 - 输入时立即进入 loading 状态
const debouncedSearch = useDebounceFn((query: string) => {
   performSearch(query);
}, 300);

watch(localQuery, (newQuery) => {
   // 输入时立即进入 loading 状态
   if (newQuery.trim()) {
      isSearching.value = true;
   } else {
      // 清空输入时,取消 loading 并清空结果
      isSearching.value = false;
      searchResults.value = [];
   }

   // 执行防抖搜索
   debouncedSearch(newQuery);

   // 输入变化时重置选中索引
   selectedIndex.value = -1;
});

// 监听搜索类型变化，重新搜索
watch(searchTypes, () => {
   if (localQuery.value.trim()) {
      // 类型变化时也立即进入 loading 状态
      isSearching.value = true;
      debouncedSearch(localQuery.value);
   }
   selectedIndex.value = -1;
});

// 监听搜索结果变化，重置选中索引
watch(searchResults, () => {
   selectedIndex.value = -1;
});

// 监听选中索引变化，滚动到可见区域
watch(selectedIndex, (newIndex) => {
   if (newIndex >= 0 && resultsContainerRef.value) {
      nextTick(() => {
         const container = resultsContainerRef.value;
         const items = container?.querySelectorAll('[data-result-item]');
         const selectedItem = items?.[newIndex] as HTMLElement;

         if (selectedItem && container) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = selectedItem.getBoundingClientRect();

            // 如果元素不在可见区域，滚动到该元素
            if (itemRect.top < containerRect.top) {
               selectedItem.scrollIntoView({
                  block: 'nearest',
                  behavior: 'smooth',
               });
            } else if (itemRect.bottom > containerRect.bottom) {
               selectedItem.scrollIntoView({
                  block: 'nearest',
                  behavior: 'smooth',
               });
            }
         }
      });
   }
});

// 当覆盖层打开时，聚焦输入框
watch(isSearchOpen, (opened) => {
   if (opened) {
      recentAccessRef.value?.loadRecentSearches();
      nextTick(() => {
         inputRef.value?.focus();
         updateHeight();
      });
   } else {
      // 关闭时清空搜索
      localQuery.value = '';
      searchQuery.value = '';
      searchTypes.value = [];
      selectedIndex.value = -1;
   }
});

// 键盘导航处理
const handleKeydown = (e: KeyboardEvent) => {
   if (e.key === 'Escape') {
      closeSearch();
      return;
   }

   // 只在有搜索结果时处理上下键和回车键
   if (searchResults.value.length === 0) return;

   if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = Math.min(
         selectedIndex.value + 1,
         searchResults.value.length - 1
      );
   } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
   } else if (e.key === 'Enter') {
      e.preventDefault();
      if (
         selectedIndex.value >= 0 &&
         selectedIndex.value < searchResults.value.length
      ) {
         const result = searchResults.value[selectedIndex.value];
         if (result) {
            handleResultClick(result);
         }
      }
   }
};

// 点击背景关闭
const handleBackdropClick = () => {
   closeSearch();
};

// 阻止点击内容区域时关闭
const handleContentClick = (e: Event) => {
   e.stopPropagation();
};

// 点击搜索结果
const handleResultClick = (result: SearchResult) => {
   if (result.url) {
      // 保存搜索历史
      if (localQuery.value.trim()) {
         saveSearch(localQuery.value.trim());
         recentAccessRef.value?.loadRecentSearches();
      }
      navigateTo(result.url);
      closeSearch();
   }
};

// 从子组件接收搜索事件
const handleRecentSearch = (query: string) => {
   localQuery.value = query;
   performSearch(query);
};

// 从子组件接收导航事件
const handleQuickAccessNavigate = (url: string) => {
   navigateTo(url);
   closeSearch();
};

const isWindows = computed(() => {
   return navigator ? navigator.userAgent.includes('Windows') : false;
});
const teleported = useClientTeleport();
</script>

<template>
   <Teleport to="body" :disabled="!teleported">
      <Transition name="search-overlay">
         <div
            v-if="isSearchOpen"
            class="fixed inset-0 z-[10001] bg-background/50 backdrop-blur-md flex items-start justify-center pt-[20vh]"
            @click="handleBackdropClick"
            @keydown="handleKeydown">
            <div class="w-full max-w-[42rem] mx-4" @click="handleContentClick">
               <!-- 搜索框 -->
               <div class="flex flex-col gap-3">
                  <!-- 搜索输入区 -->
                  <div
                     class="flex items-center gap-3 p-4 bg-accent-700 rounded-xl border border-secondary ring-4 ring-secondary/10">
                     <LoadingFour
                        v-if="isSearching"
                        class="text-xl text-accent-300 animate-spin shrink-0" />
                     <Search v-else class="text-xl text-accent-300 shrink-0" />
                     <input
                        ref="inputRef"
                        v-model="localQuery"
                        type="text"
                        placeholder="搜索题目、标签、用户、页面..."
                        class="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-accent-300"
                        @keydown.esc="closeSearch" />
                     <button
                        v-if="localQuery.trim()"
                        class="text-accent-300 hover:text-white transition-colors p-1"
                        @click="localQuery = ''">
                        <Close class="text-base cursor-pointer" />
                     </button>
                     <!-- cmd+k -->
                     <div
                        v-else
                        class="hidden md:flex items-center gap-2 text-accent-300 rounded text-xs">
                        <kbd
                           v-if="isWindows"
                           class="bg-accent-600 rounded border border-accent-500 text-[0.75rem] leading-[0.5rem] h-6 px-1.5 flex items-center justify-center font-family-fira-code">
                           Ctrl
                        </kbd>
                        <kbd
                           v-else
                           class="bg-accent-600 rounded border border-accent-500 text-base leading-[0.5rem] size-6 flex items-center justify-center">
                           ⌘
                        </kbd>
                        <kbd
                           class="bg-accent-600 rounded border border-accent-500 text-[0.75rem] leading-[0.5rem] size-6 font-family-fira-code flex items-center justify-center">
                           K
                        </kbd>
                     </div>
                  </div>

                  <!-- 搜索结果区域 - 外层容器：动态高度+动画 -->
                  <div
                     class="bg-accent-700 rounded-xl border border-accent-600 relative overflow-hidden transition-all duration-300 ease-in-out"
                     :style="{ height: containerHeight + 'px' }">
                     <!-- 内层容器：绝对定位+滚动 -->
                     <div
                        ref="resultsContainerRef"
                        class="absolute inset-0 overflow-y-auto"
                        :style="{
                           paddingBottom: BOTTOM_FIXED_HEIGHT + 'px',
                        }">
                        <!-- 内容区域 -->
                        <div ref="contentRef">
                           <!-- 搜索类型过滤 -->
                           <StSearchOverlaySearchTypeFilter
                              v-model="searchTypes" />

                           <!-- 加载中 - 骨架屏 -->
                           <div v-if="isSearching">
                              <!-- 显示 3 组骨架屏，每组 2 个结果项 -->
                              <div v-for="groupIndex in 3" :key="groupIndex">
                                 <hr
                                    class="border-0 border-t border-accent-500 mx-4 my-1" />
                                 <!-- 分组标题骨架 -->
                                 <div class="px-4 pt-4 pb-2">
                                    <StSkeletonItem class="h-5 w-20" />
                                 </div>
                                 <!-- 结果项骨架 -->
                                 <div class="mx-2 mb-2">
                                    <StSearchOverlaySearchResultSkeleton
                                       v-for="index in 2"
                                       :key="index" />
                                 </div>
                              </div>
                           </div>

                           <!-- 无搜索内容 - 显示最近搜索和快速访问 -->
                           <StSearchOverlayRecentAndQuickAccess
                              v-if="!localQuery.trim()"
                              ref="recentAccessRef"
                              @search="handleRecentSearch"
                              @navigate="handleQuickAccessNavigate"
                              @height-change="updateHeight" />

                           <!-- 无结果 -->
                           <div
                              v-else-if="
                                 !isSearching && searchResults.length === 0
                              "
                              class="px-6 py-12 text-center">
                              <StEmptyStatus content="未找到相关结果" />
                           </div>

                           <!-- 搜索结果列表 - 按类型分组 -->
                           <div v-else-if="!isSearching">
                              <div
                                 v-for="(group, groupIndex) in groupedResults"
                                 :key="group.type">
                                 <hr
                                    class="border-0 border-t border-accent-500 mx-4 my-1" />

                                 <!-- 分组标题 -->
                                 <div
                                    class="px-4 pt-4 pb-2 border-accent-500 flex items-center gap-2">
                                    <span
                                       class="st-font-caption text-accent-200">
                                       {{ group.label }}
                                    </span>
                                    <span
                                       class="text-xs text-accent-400 font-family-manrope">
                                       ({{ group.results.length }})
                                    </span>
                                 </div>

                                 <!-- 该分组的搜索结果 -->
                                 <div
                                    class="divide-y divide-accent-500 mx-2 mb-2">
                                    <StSearchOverlaySearchResultItem
                                       v-for="(
                                          result, resultIndex
                                       ) in group.results"
                                       :key="result.id"
                                       :result="result"
                                       :is-selected="
                                          selectedIndex ===
                                          getGlobalIndex(
                                             groupIndex,
                                             resultIndex
                                          )
                                       "
                                       data-result-item
                                       @click="handleResultClick" />
                                 </div>
                              </div>

                              <!-- 加载更多 -->
                              <div
                                 v-if="hasMoreResults"
                                 class="flex justify-center py-3">
                                 <button
                                    class="px-4 py-1.5 text-xs rounded-lg bg-accent-600 hover:bg-accent-500 text-accent-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                    :disabled="isLoadingMore"
                                    @click="loadMore">
                                    {{
                                       isLoadingMore
                                          ? '加载中...'
                                          : '加载更多'
                                    }}
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>

                     <!-- 底部提示 - 固定在底部 -->
                     <div
                        class="absolute bottom-0 left-0 right-0 px-5 py-4 bg-accent-700 flex items-center justify-between text-xs text-accent-300 border-t border-accent-600"
                        :style="{ height: BOTTOM_FIXED_HEIGHT + 'px' }">
                        <StSpace gap="1rem" align="center">
                           <StSpace gap="0.25rem" align="center">
                              <kbd
                                 class="px-1.5 py-0.5 bg-accent-600 rounded border border-accent-500 text-[0.625rem]">
                                 ↑
                              </kbd>
                              <kbd
                                 class="px-1.5 py-0.5 bg-accent-600 rounded border border-accent-500 text-[0.625rem]">
                                 ↓
                              </kbd>
                              <span>导航</span>
                           </StSpace>
                           <StSpace gap="0.25rem" align="center">
                              <kbd
                                 class="px-1.5 py-0.5 bg-accent-600 rounded border border-accent-500 text-[0.625rem]">
                                 Enter
                              </kbd>
                              <span>选择</span>
                           </StSpace>
                           <StSpace gap="0.25rem" align="center">
                              <kbd
                                 class="px-1.5 py-0.5 bg-accent-600 rounded border border-accent-500 text-[0.625rem]">
                                 Esc
                              </kbd>
                              <span>关闭</span>
                           </StSpace>
                        </StSpace>
                        <div
                           v-if="searchResults.length > 0"
                           class="text-accent-400">
                           共 {{ searchResults.length }} 条
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </Transition>
   </Teleport>
</template>

<style scoped>
.search-overlay-enter-active,
.search-overlay-leave-active {
   transition: opacity 0.2s ease;
}

.search-overlay-enter-from,
.search-overlay-leave-to {
   opacity: 0;
}

.search-overlay-enter-active > div,
.search-overlay-leave-active > div {
   transition: transform 0.2s ease, opacity 0.2s ease;
}

.search-overlay-enter-from > div {
   transform: translateY(-1rem);
   opacity: 0;
}

.search-overlay-leave-to > div {
   transform: translateY(-1rem);
   opacity: 0;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
   width: 8px;
}

::-webkit-scrollbar-track {
   background: transparent;
}

::-webkit-scrollbar-thumb {
   background: rgb(var(--color-accent-500));
   border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
   background: rgb(var(--color-accent-400));
}
</style>
