<script setup lang="ts">
import DEFAULT_PROFILE_BANNER from '@/assets/images/default-profile-banner.webp';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.webp';
import useAuthStore from '~/stores/auth-store';

const { $trpc } = useNuxtApp();
const { data: commitStatistic, pending } = useAsyncData('profile', () =>
   $trpc.protected.problem.getCommitStatistic.query(),
);

const correctRate = computed(() => {
   if (!commitStatistic.value) return '--%';
   return commitStatistic.value.correctRate.toFixed(2) + '%';
});

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role !== 'USER');

const username = computed(
   () => authStore.user?.displayName || authStore.user?.name || '用户',
);

const avatarUrl = computed(() => {
   // 用数据库里的文件名 avatar.name，而不是 imageId 硬拼 .jpg：
   // 实际文件是 .png/.webp，硬拼 .jpg 必然 404。
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId
      ? `/api/static/${user.imageId}`
      : DEFAULT_AVATAR_URL;
});

const description = computed(() => {
   return isAdmin.value ? '管理员' : '普通用户';
});
</script>

<template>
   <StSpace class="w-[18.875rem] p-2 pb-7 rounded-xl bg-accent-600 relative">
      <StSpace fill-x direction="vertical" align="center" class="mt-[5.62rem]">
         <StSpace
            class="w-[17.875rem] h-32 rounded-t-lg bg-accent-500 absolute top-2 left-2 overflow-hidden">
            <StSkeletonItem v-if="pending" class="size-full rounded-md" />
            <StImage v-else :src="DEFAULT_PROFILE_BANNER" class="size-full" />
         </StSpace>

         <StSpace direction="vertical" align="center" gap="0.75rem">
            <StSkeletonItem
               v-if="pending"
               class="size-[5.25rem] rounded-full z-10 border-4 border-accent-600" />
            <StImage
               v-else
               :src="avatarUrl"
               :fallback="DEFAULT_AVATAR_URL"
               class="!rounded-full z-10 border-4 border-accent-600"
               width="5.25rem"
               height="5.25rem" />
            <StSpace direction="vertical" align="center" gap="0.375rem">
               <div class="st-font-body-bold">{{ username }}</div>
               <div class="st-font-caption">{{ description }}</div>
            </StSpace>
         </StSpace>

         <StDivider simple />

         <StSpace fill-x justify="between" class="px-8">
            <template v-if="pending">
               <StSpace
                  v-for="i in 3"
                  :key="i"
                  direction="vertical"
                  gap="0.5rem">
                  <StSkeletonItem
                     class="w-[3.75rem] h-[1.3125rem] rounded-md" />
                  <StSkeletonItem
                     class="w-[2.75rem] h-[1.3125rem] rounded-md" />
               </StSpace>
            </template>
            <template v-else>
               <StSpace direction="vertical" gap="0.5rem" align="center">
                  <div class="st-font-body-normal text-accent-200">得分</div>
                  <div class="leading-[90%] font-family-manrope font-bold">
                     {{ commitStatistic?.score ?? '--' }}
                  </div>
               </StSpace>
               <StSpace direction="vertical" gap="0.5rem" align="center">
                  <div class="st-font-body-normal text-accent-200">正确率</div>
                  <div
                     class="leading-[90%] font-family-manrope font-bold text-success">
                     {{ correctRate }}
                  </div>
               </StSpace>
               <StSpace direction="vertical" gap="0.5rem" align="center">
                  <div class="st-font-body-normal text-accent-200">作答数</div>
                  <div class="leading-[90%] font-family-manrope font-bold">
                     {{ commitStatistic?.passCount ?? '--' }}
                  </div>
               </StSpace>
            </template>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
