<script setup lang="ts">
import { Lock, Ranking, Right } from '@icon-park/vue-next';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.png';

const { $trpc } = useNuxtApp();

const { data: rankings } = useAsyncData('rankings', () =>
   $trpc.public.rank.getGlobalRankings.query()
);

const topThree = computed(() => (rankings.value ?? []).slice(0, 3));

const medalClass = (rank: number) => {
   if (rank === 1) return 'bg-[#FFBE31] text-accent-700';
   if (rank === 2) return 'bg-[#CACACA] text-accent-700';
   if (rank === 3) return 'bg-[#9E5C38] text-white';
   return 'bg-accent-500 text-white';
};
</script>

<template>
   <NuxtLink to="/app/rankings" class="block w-full">
      <div
         class="p-4 bg-accent-600 rounded-2xl flex flex-col gap-3 transition-colors active:bg-accent-500">
         <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
               <Ranking class="text-[1.25rem]" />
               <span class="font-bold">排行榜</span>
            </div>
            <div class="flex items-center gap-1 text-accent-300 st-font-caption">
               查看完整榜单
               <Right size="0.875rem" />
            </div>
         </div>
         <div v-if="topThree.length" class="grid grid-cols-3 gap-2">
            <div
               v-for="item in topThree"
               :key="item.userId"
               class="flex flex-col items-center gap-1.5 p-2 bg-accent-500 rounded-xl min-w-0">
               <div
                  class="flex items-center justify-center font-bold size-[1.75rem] rounded-full text-xs font-family-manrope shrink-0"
                  :class="medalClass(item.rank)">
                  {{ item.rank }}
               </div>
               <StImage
                  lazy
                  :src="item.avatarUrl ?? DEFAULT_AVATAR_URL"
                  alt="avatar"
                  width="2.5rem"
                  height="2.5rem"
                  object="cover"
                  class="rounded-lg" />
               <span class="st-font-tooltip text-accent-100 max-w-full truncate">
                  {{ item.userName }}
               </span>
               <span class="st-font-tooltip font-family-manrope font-bold text-primary">
                  {{ item.score }}分
               </span>
            </div>
         </div>
         <div v-else class="py-3 flex items-center justify-center gap-2 text-accent-400 st-font-caption">
            <Lock size="1.25rem" />
            暂无排行数据
         </div>
      </div>
   </NuxtLink>
</template>
