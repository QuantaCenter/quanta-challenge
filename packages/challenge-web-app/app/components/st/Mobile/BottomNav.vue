<script setup lang="ts">
import {
   BookOpen,
   DashboardTwo,
   Ranking,
   TableReport,
   Trophy,
   User,
} from '@icon-park/vue-next';

const route = useRoute();

const items = [
   { to: '/app/dashboard', label: '仪表盘', icon: DashboardTwo },
   { to: '/app/rankings', label: '排行榜', icon: Ranking },
   { to: '/app/problems', label: '题目', icon: TableReport },
   { to: '/app/learning', label: '学习', icon: BookOpen },
   { to: '/app/achievements', label: '成就', icon: Trophy },
   { to: '/app/space', label: '我的', icon: User },
];

const isActive = (to: string) =>
   route.path === to || route.path.startsWith(`${to}/`);
</script>

<template>
   <nav
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
