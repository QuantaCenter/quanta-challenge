<script setup lang="ts">
import dayjs from 'dayjs';
import { CheckOne, DocDetail, Round } from '@icon-park/vue-next';
import ArticleCover from './ArticleCover.vue';

const props = withDefaults(
   defineProps<{
      id: string;
      title: string;
      summary: string;
      coverImageName?: string | null;
      publishedAt?: string | Date | null;
      authorName?: string | null;
      authorAvatarName?: string | null;
      problemCount?: number;
      percent?: number;
      completed?: boolean;
      to?: string;
      divider?: boolean;
   }>(),
   {
      coverImageName: null,
      publishedAt: null,
      authorName: '',
      authorAvatarName: null,
      problemCount: 0,
      percent: 0,
      completed: false,
      to: undefined,
      divider: true,
   },
);

const publishDate = computed(() =>
   props.publishedAt ? dayjs(props.publishedAt).format('YYYY-MM-DD') : '',
);
const avatarUrl = computed(() =>
   props.authorAvatarName
      ? `/api/static/${encodeURIComponent(props.authorAvatarName)}`
      : undefined,
);
</script>

<template>
   <NuxtLink
      :to="to ?? `/app/articles/${id}`"
      class="group flex w-full items-stretch gap-4 py-5 max-sm:gap-3">
      <StAvatar
         :url="avatarUrl"
         size="2rem"
         class="mt-0.5 shrink-0" />

      <div class="flex min-w-0 flex-1 flex-col gap-2">
         <div class="min-w-0 st-font-caption">
            <span class="block truncate text-accent-200">
               {{ authorName || '匿名' }}
            </span>
         </div>

         <div class="flex flex-col gap-1.5">
            <h3
               class="line-clamp-1 min-w-0 text-[1.25rem] font-bold leading-snug text-white transition-colors group-hover:text-secondary max-sm:text-base">
               {{ title }}
            </h3>
            <p class="line-clamp-2 text-justify st-font-caption leading-normal text-accent-400 transition-colors group-hover:text-accent-300">
               {{ summary }}
            </p>
         </div>

         <div class="mt-auto flex flex-wrap items-center gap-3 st-font-caption text-accent-400">
            <CheckOne
               v-if="completed"
               class="shrink-0 text-success"
               size="0.875rem"
               :strokeWidth="3" />
            <Round v-else class="shrink-0" size="0.875rem" :strokeWidth="3" />
            <span class="shrink-0" :class="{ 'text-success': completed }">
               {{ completed ? '已完成' : percent > 0 ? `${percent}%` : '未学习' }}
            </span>
            <span v-if="problemCount" class="flex shrink-0 items-center gap-1">
               <DocDetail size="0.875rem" />{{ problemCount }} 道题
            </span>
            <span
               v-if="publishDate"
               class="shrink-0 font-family-manrope text-accent-400">
               {{ publishDate }}
            </span>
         </div>
      </div>

      <div
         v-if="coverImageName"
         class="relative h-[8rem] w-[12rem] shrink-0 overflow-hidden rounded-[0.375rem] ring-1 ring-white/5 max-sm:h-[6rem] max-sm:w-[7rem]">
         <div class="size-full transition-transform duration-300 group-hover:scale-[1.03]">
            <ArticleCover
               :image-name="coverImageName"
               height="100%"
               icon-size="2.5rem" />
         </div>
         <div
            class="absolute inset-0 bg-background/5 transition-colors group-hover:bg-background/20" />
      </div>
   </NuxtLink>
   <StDivider v-if="divider" simple class="opacity-30 last:hidden" />
</template>
