<script setup lang="ts">
import { History, Ranking, Close } from '@icon-park/vue-next';
import { CalendarThirtyTwo, ListView } from '@icon-park/vue-next';
import {
   GoldMedalTwo,
   VolumeNotice,
   CategoryManagement,
   UploadTwo,
} from '@icon-park/vue-next';
import { SEARCH_CONSTANTS } from '@challenge/shared/config';
import useAuthStore from '~/stores/auth-store';

const emit = defineEmits<{
   search: [query: string];
   navigate: [url: string];
   heightChange: [];
}>();

// 最近搜索 - 从 localStorage 读取
const recentSearches = ref<string[]>([]);

const loadRecentSearches = () => {
   try {
      const stored = localStorage.getItem(SEARCH_CONSTANTS.RECENT_SEARCH_KEY);
      if (stored) {
         recentSearches.value = JSON.parse(stored).slice(
            0,
            SEARCH_CONSTANTS.MAX_RECENT_SEARCHES
         );
      }
   } catch (error) {
      console.error('加载最近搜索失败:', error);
   }
};

// 删除单个最近搜索
const deleteRecentSearch = (index: number) => {
   try {
      recentSearches.value.splice(index, 1);
      localStorage.setItem(
         SEARCH_CONSTANTS.RECENT_SEARCH_KEY,
         JSON.stringify(recentSearches.value)
      );
      // 通知父组件更新高度
      nextTick(() => {
         emit('heightChange');
      });
   } catch (error) {
      console.error('删除搜索记录失败:', error);
   }
};

// 清空所有最近搜索
const clearAllRecentSearches = () => {
   try {
      recentSearches.value = [];
      localStorage.removeItem(SEARCH_CONSTANTS.RECENT_SEARCH_KEY);
      // 通知父组件更新高度
      nextTick(() => {
         emit('heightChange');
      });
   } catch (error) {
      console.error('清空搜索记录失败:', error);
   }
};

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role !== 'USER');

// 快速访问链接（管理类入口仅对管理员显示）
const quickAccessLinks = computed(() => [
   { label: '题库', url: '/app/problems', icon: ListView },
   { label: '每日一题', url: '/app/dashboard', icon: CalendarThirtyTwo },
   { label: '成就', url: '/app/achievements', icon: GoldMedalTwo },
   { label: '通知中心', url: '/app/notifications', icon: VolumeNotice },
   { label: '排行榜', url: '/app/rankings', icon: Ranking },
   ...(isAdmin.value
      ? [
           {
              label: '发布流程',
              url: '/app/publish',
              icon: UploadTwo,
           },
           {
              label: '管理流程',
              url: '/app/manage',
              icon: CategoryManagement,
           },
        ]
      : []),
]);

// 点击最近搜索项
const handleRecentSearchClick = (query: string) => {
   emit('search', query);
};

// 点击快速访问链接
const handleQuickAccessClick = (url: string) => {
   emit('navigate', url);
};

// 组件挂载时加载
onMounted(() => {
   loadRecentSearches();
});

// 暴露加载方法供父组件调用
defineExpose({
   loadRecentSearches,
});
</script>

<template>
   <div>
      <!-- 最近搜索 -->
      <div v-if="recentSearches.length > 0">
         <hr class="border-0 border-t border-accent-500 mx-4 my-1" />
         <div
            class="px-4 pt-4 pb-2 border-accent-500 flex items-center justify-between gap-2">
            <span class="st-font-caption text-accent-200">最近搜索</span>
            <button
               class="text-xs text-accent-400 hover:text-accent-200 transition-colors cursor-pointer"
               @click="clearAllRecentSearches">
               清空
            </button>
         </div>
         <div class="mx-2 mb-2">
            <div
               v-for="(query, index) in recentSearches"
               :key="index"
               class="group w-full px-4 py-3 text-sm text-white hover:bg-accent-600 transition-colors flex items-center gap-3 rounded-lg relative">
               <button
                  class="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  @click="handleRecentSearchClick(query)">
                  <History size="1rem" class="text-accent-400 shrink-0" />
                  <span class="flex-1 truncate">{{ query }}</span>
               </button>
               <button
                  class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent-500 rounded shrink-0 cursor-pointer"
                  @click.stop="deleteRecentSearch(index)"
                  title="删除">
                  <Close size="0.875rem" class="text-accent-400" />
               </button>
            </div>
         </div>
      </div>

      <!-- 快速访问 -->
      <div>
         <hr class="border-0 border-t border-accent-500 mx-4 my-1" />
         <div class="px-4 pt-4 pb-2 border-accent-500 flex items-center gap-2">
            <span class="st-font-caption text-accent-200">快速访问</span>
         </div>
         <div class="mx-2 mb-2">
            <button
               v-for="link in quickAccessLinks"
               :key="link.url"
               class="w-full px-4 py-3 text-left text-sm text-white hover:bg-accent-600 transition-colors flex items-center gap-3 rounded-lg cursor-pointer"
               @click="handleQuickAccessClick(link.url)">
               <component
                  :is="link.icon"
                  size="1rem"
                  class="text-accent-400 shrink-0" />
               <span class="flex-1">{{ link.label }}</span>
            </button>
         </div>
      </div>
   </div>
</template>
