<script setup lang="ts">
import { BookmarkThree, Box, CheckOne, PlayOne } from '@icon-park/vue-next';
import ProgressBar from '~/components/learning/ProgressBar.vue';
import LinkButton from '../_components/LinkButton.vue';

const { $trpc } = useNuxtApp();
const { data, pending, error, refresh } = useAsyncData('recent-learning', () => $trpc.protected.dashboard.getRecentLearning.query());
const items = computed(() => data.value ?? []);
const list = useTemplateRef<HTMLElement>('list');
const { arrivedState } = useScroll(list);
const { height } = useElementSize(list);
const atBottom = ref(true);
function updateBottom() {
   const el = list.value;
   atBottom.value = !el || el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
}
watch([items, height], () => nextTick(updateBottom), { flush: 'post' });
</script>

<template>
   <StCard title="最近学习" class="aspect-square !pb-0 overflow-hidden">
      <template #header-right>
         <LinkButton to="/app/learning" description="查看全部课程" />
      </template>

      <StSkeleton v-if="pending" loading class="mt-6">
         <template #loading>
            <StSpace direction="vertical" gap="0.75rem">
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
               <StSkeletonItem rounded="lg" class="w-full h-[5rem]" />
            </StSpace>
         </template>
      </StSkeleton>

      <StSpace v-else-if="error" fill direction="vertical" gap="0.75rem" align="center" justify="center" class="pb-4 text-accent-300">
         <span>
            学习记录加载失败
         </span>
         <StButton size="sm" bordered @click="refresh()">
            重试
         </StButton>
      </StSpace>
      <StSpace
         v-else-if="!items.length"
         fill
         direction="vertical"
         gap="0.75rem"
         align="center"
         justify="center"
         class="text-accent-400 pb-4">
         <Box size="3.625rem" :strokeWidth="2" />
         <div class="st-font-body-normal">
            暂无学习记录
         </div>
      </StSpace>

      <div v-else class="relative mt-5 flex min-h-0 w-full flex-1 flex-col">
         <div
            ref="list"
            class="hide-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4 [scrollbar-width:none]"
            @scroll="updateBottom">
            <div v-for="item in items" :key="item.id" class="w-full rounded-xl bg-accent-500 px-4 py-3">
               <div class="flex w-full flex-col gap-3">
                  <div class="flex w-full items-center gap-2">
                     <BookmarkThree class="shrink-0 text-accent-100" size="1.25rem" :strokeWidth="4" />
                     <NuxtLink :to="`/app/learning/study/${item.id}`" class="min-w-0 flex-1 truncate text-accent-100" :title="item.title">
                        {{ item.title }}
                     </NuxtLink>
                     <CheckOne v-if="item.finished" class="size-5 shrink-0 text-success" size="100%" aria-label="已学完" />
                  </div>
                  <StSpace align="center" gap="0.75rem" fill-x>
                     <ProgressBar :percent="item.percent" />
                     <NuxtLink
                        :to="`/app/learning/study/${item.id}`"
                        :aria-label="`${item.finished ? '复习' : '继续学习'}：${item.title}`"
                        :title="`已完成 ${item.completed}/${item.total} 节`"
                        class="inline-flex size-5.25 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform hover:opacity-80 active:scale-90">
                        <PlayOne theme="filled" class="size-3" size="100%" />
                     </NuxtLink>
                  </StSpace>
               </div>
            </div>
         </div>
         <div class="top-mask pointer-events-none absolute top-0 h-8 w-full transition-opacity" :class="arrivedState.top ? 'opacity-0' : 'opacity-100'"></div>
         <div class="bottom-mask pointer-events-none absolute bottom-0 h-[4.125rem] w-full transition-opacity" :class="atBottom ? 'opacity-0' : 'opacity-100'"></div>
      </div>
   </StCard>
</template>

<style scoped src="../_styles/index.css" />

<style scoped>
.top-mask {
   background: linear-gradient(0deg, rgb(39 39 39 / 0%) 0%, #272727 95%);
}
</style>
