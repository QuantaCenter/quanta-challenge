<script setup lang="ts">
import {
   CategoryManagement,
   Close,
   DashboardTwo,
   Logout,
   Ranking,
   SettingTwo,
   TableReport,
   Trophy,
   UploadTwo,
   User,
} from '@icon-park/vue-next';
import useAuthStore from '~/stores/auth-store';

const props = defineProps<{
   open: boolean;
}>();

const emit = defineEmits<{
   'update:open': [boolean];
}>();

const authStore = useAuthStore();
const role = computed(() => authStore.user?.role ?? 'USER');
const route = useRoute();

const username = computed(
   () => authStore.user?.displayName || authStore.user?.name || '用户'
);

const description = computed(() =>
   role.value !== 'USER' ? '管理员' : '普通用户'
);

const avatarUrl = computed(() => {
   // 与 app-layout.vue 保持一致：用数据库里的文件名（avatar.name）
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : '';
});

const close = () => emit('update:open', false);

// 与桌面端 Header/Profile.vue 的退出登录逻辑保持一致
const handleLogout = async () => {
   close();

   const confirmed = await dialog.confirm({
      title: '确认退出登录？',
      description: '退出登录后需要重新登录才能继续使用。',
      variant: 'danger',
   });

   if (!confirmed) {
      return;
   }

   if (import.meta.client) {
      localStorage.removeItem('csrfToken');
   }

   await navigateTo('/auth/login');

   if (import.meta.client) {
      window.location.reload();
   }
};

const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`);

// 抽屉打开时锁定背景滚动
watch(
   () => props.open,
   (open) => {
      if (import.meta.client) {
         document.body.style.overflow = open ? 'hidden' : '';
      }
   }
);

onUnmounted(() => {
   if (import.meta.client) {
      document.body.style.overflow = '';
   }
});

// 路由变化后自动收起抽屉
watch(
   () => route.path,
   () => close()
);
</script>

<template>
   <Teleport to="body">
      <Transition name="st-mobile-drawer">
         <div v-if="open" class="fixed inset-0 z-[10000] md:hidden">
            <div class="absolute inset-0 bg-black/60" @click="close"></div>
            <div
               class="st-mobile-drawer-panel absolute right-0 top-0 h-full w-[85vw] max-w-[26rem] bg-accent-700 border-l border-accent-500 flex flex-col">
               <div
                  class="h-16 px-4 flex items-center justify-between shrink-0 border-b border-accent-500">
                  <NuxtLink
                     to="/app/space"
                     class="flex items-center gap-3 min-w-0 active:bg-accent-600 rounded-xl transition-colors -m-1 p-1">
                     <StAvatar :url="avatarUrl" class="!w-9 !h-9 shrink-0" />
                     <StSpace
                        direction="vertical"
                        justify="center"
                        gap="0.125rem">
                        <div class="font-bold text-white leading-tight">
                           {{ username }}
                        </div>
                        <div
                           class="font-light text-xs text-accent-300 leading-tight">
                           {{ description }}
                        </div>
                     </StSpace>
                  </NuxtLink>
                  <button
                     aria-label="收起菜单"
                     class="size-10 shrink-0 flex items-center justify-center rounded-full text-white active:bg-accent-500 transition-colors cursor-pointer"
                     @click="close">
                     <Close class="text-[1.375rem]" />
                  </button>
               </div>
               <nav class="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
                  <NuxtLink
                     to="/app/dashboard"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/dashboard') }">
                     <DashboardTwo />
                     <span>仪表盘</span>
                  </NuxtLink>
                  <NuxtLink
                     to="/app/rankings"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/rankings') }">
                     <Ranking />
                     <span>排行榜</span>
                  </NuxtLink>
                  <NuxtLink
                     to="/app/problems"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/problems') }">
                     <TableReport />
                     <span>题目</span>
                  </NuxtLink>
                  <NuxtLink
                     v-if="role !== 'USER'"
                     to="/app/publish"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/publish') }">
                     <UploadTwo />
                     <span>发布</span>
                  </NuxtLink>
                  <NuxtLink
                     v-if="role !== 'USER'"
                     to="/app/manage"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/manage') }">
                     <CategoryManagement />
                     <span>管理</span>
                  </NuxtLink>
                  <NuxtLink
                     to="/app/achievements"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/achievements') }">
                     <Trophy />
                     <span>成就</span>
                  </NuxtLink>
                  <NuxtLink
                     to="/app/settings"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/settings') }">
                     <SettingTwo />
                     <span>设置</span>
                  </NuxtLink>
                  <NuxtLink
                     to="/app/space"
                     class="st-mobile-drawer-item"
                     :class="{ 'bg-accent-600 text-white': isActive('/app/space') }">
                     <User />
                     <span>个人空间</span>
                  </NuxtLink>
               </nav>
               <div class="shrink-0 border-t border-accent-500 p-3">
                  <button
                     class="st-mobile-drawer-item w-full cursor-pointer text-left hover:text-error"
                     @click="handleLogout">
                     <Logout />
                     <span>退出登录</span>
                  </button>
               </div>
            </div>
         </div>
      </Transition>
   </Teleport>
</template>

<style lang="css" scoped>
.st-mobile-drawer-item {
   display: flex;
   align-items: center;
   gap: 0.875rem;
   padding: 0.75rem 1rem;
   border-radius: 0.75rem;
   color: var(--color-accent-200);
   transition:
      background-color 0.15s ease,
      color 0.15s ease;
}

.st-mobile-drawer-item:active {
   background-color: var(--color-accent-500);
}

.st-mobile-drawer-enter-active,
.st-mobile-drawer-leave-active {
   transition: opacity 0.2s ease;
}

.st-mobile-drawer-enter-active .st-mobile-drawer-panel,
.st-mobile-drawer-leave-active .st-mobile-drawer-panel {
   transition: transform 0.25s ease;
}

.st-mobile-drawer-enter-from,
.st-mobile-drawer-leave-to {
   opacity: 0;
}

.st-mobile-drawer-enter-from .st-mobile-drawer-panel,
.st-mobile-drawer-leave-to .st-mobile-drawer-panel {
   transform: translateX(100%);
}
</style>
