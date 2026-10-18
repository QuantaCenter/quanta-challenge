<script setup lang="ts">
import type { DefineComponent } from 'vue';
import {
   CategoryManagement,
   Right,
   SettingTwo,
   TableReport,
   Trophy,
} from '@icon-park/vue-next';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.png';
import useAuthStore from '~/stores/auth-store';

useSeoMeta({ title: '我的 - Quanta Challenge' });

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role !== 'USER');

const username = computed(
   () => authStore.user?.displayName || authStore.user?.name || '用户'
);

const roleText = computed(() => (isAdmin.value ? '管理员' : '普通用户'));

const avatarUrl = computed(() => {
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : DEFAULT_AVATAR_URL;
});

interface MineEntry {
   label: string;
   description: string;
   to: string;
   icon: DefineComponent;
}

const entries = computed<MineEntry[]>(() => {
   const list: MineEntry[] = []
      if (isAdmin.value) {
      list.push(
         {
            label: '我的发布',
            description: '查看与管理我发布的题目',
            to: '/app/publish/problem/mine',
            icon: TableReport,
         },
         {
            label: '管理',
            description: '成员、标签、成就与云函数管理',
            to: '/app/manage',
            icon: CategoryManagement,
         }
      );
   }
   list.push(
      {
         label: '我的成就',
         description: '查看已获得的徽章与成就进度',
         to: '/app/achievements',
         icon: Trophy,
      },
      {
         label: '设置',
         description: '账号安全、密码与偏好设置',
         to: '/app/settings',
         icon: SettingTwo,
      },
   );
   return list;
});
</script>

<template>
   <div class="px-4 py-4 w-full max-w-[30rem] mx-auto flex flex-col gap-4">
      <NuxtLink
         v-if="authStore.user?.name"
         :to="`/app/space/${authStore.user.name}`"
         class="block">
         <div
            class="p-4 bg-accent-600 rounded-2xl flex items-center gap-4 transition-colors active:bg-accent-500">
            <StImage
               :src="avatarUrl"
               width="4rem"
               height="4rem"
               object="cover"
               class="rounded-xl shrink-0" />
            <div class="flex-1 min-w-0 flex flex-col gap-1">
               <div class="st-font-third-bold truncate">{{ username }}</div>
               <div
                  class="w-fit st-font-tooltip border border-primary py-0.5 px-2 rounded-md text-primary bg-primary/5">
                  {{ roleText }}
               </div>
            </div>
            <Right class="text-accent-400 shrink-0" />
         </div>
      </NuxtLink>

      <div class="bg-accent-600 rounded-2xl overflow-hidden">
         <NuxtLink
            v-for="(entry, idx) in entries"
            :key="entry.to"
            :to="entry.to"
            class="flex items-center gap-3 px-4 py-4 transition-colors active:bg-accent-500"
            :class="{ 'border-b border-accent-500': idx !== entries.length - 1 }">
            <div
               class="size-10 rounded-xl bg-accent-500 flex items-center justify-center shrink-0">
               <Component :is="entry.icon" class="text-[1.375rem] text-accent-100" />
            </div>
            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
               <div class="st-font-body-bold">{{ entry.label }}</div>
               <div class="st-font-tooltip text-accent-300 truncate">
                  {{ entry.description }}
               </div>
            </div>
            <Right class="text-accent-400 shrink-0" />
         </NuxtLink>
      </div>
   </div>
</template>
