<script setup lang="ts">
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.webp';
import useAuthStore from '~/stores/auth-store';

const { $trpc } = useNuxtApp();

const authStore = useAuthStore();

const avatarUrl = computed(() => {
   // 与 ProfileCard 口径一致：用数据库里的文件名 avatar.name，而不是 imageId 硬拼扩展名
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId
      ? `/api/static/${user.imageId}`
      : DEFAULT_AVATAR_URL;
});

// 复用桌面端卡片的 useAsyncData key，共享缓存避免重复请求
const { data: myRank, pending: loadingRank } = useAsyncData('ranking', () =>
   $trpc.protected.rank.getMyGlobalRank.query()
);

// 正确率 / 作答数：与 ProfileCard 同源（key 共享缓存）
const { data: commitStatistic, pending: loadingStatistic } = useAsyncData(
   'profile',
   () => $trpc.protected.problem.getCommitStatistic.query()
);

const correctRate = computed(() => {
   if (!commitStatistic.value) return '--%';
   return commitStatistic.value.correctRate.toFixed(2) + '%';
});

const displayedRank = computed(() =>
   myRank.value === -1 ? '0' : (myRank.value ?? 0)
);

const pending = computed(() => loadingRank.value || loadingStatistic.value);
</script>

<template>
   <StSpace
      justify="between"
      align="center"
      class="w-full py-4 pl-4 pr-6 bg-accent-600 rounded-xl">
      <StSpace gap="1.25rem" align="center">
         <StImage
            :src="avatarUrl"
            :fallback="DEFAULT_AVATAR_URL"
            alt="头像"
            width="2.75rem"
            height="2.75rem"
            object="cover"
            class="!rounded-full shrink-0" />
         <StSpace direction="vertical" gap="0.25rem" align="center">
            <StSkeletonItem
               v-if="pending"
               class="w-[6rem] h-[1.3125rem] rounded-md" />
            <div v-else class="st-font-caption text-accent-300">当前排名</div>
            <StSkeletonItem
               v-if="pending"
               class="w-[5rem] h-[1.3125rem] rounded-md" />
            <div
               v-else
               class="leading-[100%] font-bold font-family-manrope text-primary">
               {{ displayedRank }}
            </div>
         </StSpace>
      </StSpace>

      <StSpace direction="vertical" gap="0.25rem" align="center">
         <StSkeletonItem
            v-if="pending"
            class="w-[4.5rem] h-[1.3125rem] rounded-md" />
         <div v-else class="st-font-caption text-accent-300">正确率</div>
         <StSkeletonItem
            v-if="pending"
            class="w-[4.5rem] h-[1.3125rem] rounded-md" />
         <div
            v-else
            class="leading-[100%] font-bold font-family-manrope text-success">
            {{ correctRate }}
         </div>
      </StSpace>

      <StSpace direction="vertical" gap="0.25rem" align="center">
         <StSkeletonItem
            v-if="pending"
            class="w-[4.5rem] h-[1.3125rem] rounded-md" />
         <div v-else class="st-font-caption text-accent-300">作答数</div>
         <StSkeletonItem
            v-if="pending"
            class="w-[4.5rem] h-[1.3125rem] rounded-md" />
         <div
            v-else
            class="leading-[100%] font-bold font-family-manrope text-white">
            {{ commitStatistic?.passCount ?? '--' }}
         </div>
      </StSpace>
   </StSpace>
</template>
