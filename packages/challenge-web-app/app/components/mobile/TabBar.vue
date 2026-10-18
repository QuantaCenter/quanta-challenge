<script setup lang="ts">
import type { DefineComponent } from 'vue';
import {
   BookOne,
   DashboardTwo,
   TableReport,
   UploadTwo,
   User,
} from '@icon-park/vue-next';
import useAuthStore from '~/stores/auth-store';

const route = useRoute();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role !== 'USER');

interface TabItem {
   label: string;
   to: string;
   icon: DefineComponent;
}

const tabs = computed<TabItem[]>(() => [
   { label: '首页', to: '/app/dashboard', icon: DashboardTwo },
   { label: '学习', to: '/app/learning', icon: BookOne },
   ...(isAdmin.value
      ? [{ label: '发布', to: '/app/publish', icon: UploadTwo }]
      : []),
   { label: '题库', to: '/app/problems', icon: TableReport },
   { label: '我的', to: '/app/mine', icon: User },
]);

const isActive = (to: string) =>
   route.path === to || route.path.startsWith(`${to}/`);
</script>

<template>
   <nav
      class="fixed bottom-[calc(1rem_+_env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-2rem)] max-w-[26rem] rounded-full border border-accent-500 bg-[#111111e6] backdrop-blur-md shadow-lg shadow-black/40">
      <div class="h-[3.25rem] flex items-stretch px-2">
         <NuxtLink
            v-for="tab in tabs"
            :key="tab.to"
            :to="tab.to"
            class="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
            :class="isActive(tab.to) ? 'text-primary' : 'text-accent-300'">
            <Component
               :is="tab.icon"
               class="text-[1.5rem]"
               :theme="isActive(tab.to) ? 'filled' : 'outline'" />
            <span class="text-[0.625rem] leading-none">{{ tab.label }}</span>
         </NuxtLink>
      </div>
   </nav>
</template>
