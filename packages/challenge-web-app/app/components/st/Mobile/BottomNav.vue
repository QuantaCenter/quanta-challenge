<script setup lang="ts">
import {
   BookOpen,
   DashboardTwo,
   Ranking,
   TableReport,
   Trophy,
   User,
} from '@icon-park/vue-next';
import useAuthStore from '~/stores/auth-store';

const route = useRoute();
const authStore = useAuthStore();

// [learning-preview] 学习课程暂未全量开放：仅对管理员及以上展示入口。
// 只是视觉隐藏，路由与接口不做权限限制；全量开放时删除 adminOnly 标记即可。
const isAdmin = computed(() => (authStore.user?.role ?? 'USER') !== 'USER');

const allItems = [
   { to: '/app/dashboard', label: '仪表盘', icon: DashboardTwo },
   { to: '/app/rankings', label: '排行榜', icon: Ranking },
   { to: '/app/problems', label: '题目', icon: TableReport },
   { to: '/app/learning', label: '学习课程', icon: BookOpen, adminOnly: true },
   { to: '/app/achievements', label: '成就', icon: Trophy },
   { to: '/app/space', label: '我的', icon: User },
];

const items = computed(() =>
   allItems.filter((item) => !item.adminOnly || isAdmin.value)
);

const isActive = (to: string) =>
   route.path === to || route.path.startsWith(`${to}/`);
</script>

<template>
   <nav
      v-if="!route.path.startsWith('/app/learning/study/')"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] md:hidden">
      <div
         class="flex items-center gap-1 px-2 py-2 rounded-full bg-accent-600/60 backdrop-blur-2xl backdrop-saturate-150 border border-accent-500/60 shadow-lg shadow-black/50">
         <NuxtLink
            v-for="item in items"
            :key="item.to"
            :to="item.to"
            :aria-label="item.label"
            class="size-11 flex items-center justify-center rounded-full transition-colors"
            :class="
               isActive(item.to)
                  ? 'bg-accent-500 text-white'
                  : 'text-accent-300'
            ">
            <component :is="item.icon" class="text-[1.25rem]" />
         </NuxtLink>
      </div>
   </nav>
</template>
