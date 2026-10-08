<script setup lang="ts">
import { Code } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { CloudFunctionRow } from '~/types/cloud-function';
import type { ITagOverflowItem } from '~/components/st/TagOverflow/type';

/** 发布页的云函数卡片。 */
const props = defineProps<{
   fn: CloudFunctionRow;
}>();

const TAG_BASE = 'rounded-md px-2 py-0.5 st-font-caption';

/** 卡片底部的标签：KV 隔离、版本数、运行状态。 */
const tags = computed<ITagOverflowItem[]>(() => [
   {
      key: 'isolation',
      label: props.fn.kvUserIsolated ? '用户隔离' : '共享 KV',
      class: `${TAG_BASE} ${
         props.fn.kvUserIsolated
            ? 'bg-secondary/15 text-secondary'
            : 'bg-primary/15 text-primary'
      }`,
   },
   {
      key: 'versions',
      label: `${props.fn._count?.versions ?? 0} 个版本`,
      class: `${TAG_BASE} bg-accent-500 text-accent-200`,
   },
   {
      key: 'status',
      label: props.fn.enabled ? '运行中' : '已停用',
      class: `${TAG_BASE} ${
         props.fn.enabled
            ? 'bg-success/15 text-success'
            : 'bg-accent-500 text-accent-300'
      }`,
   },
]);

const tagCounterClass = `${TAG_BASE} bg-accent-500 text-accent-300`;
</script>

<template>
   <NuxtLink
      :to="`/app/publish/cloud-function/${fn.name}`"
      class="group relative flex min-h-[13.5rem] flex-col overflow-hidden rounded-2xl border border-accent-500 bg-accent-600 p-5 transition-colors duration-300 hover:border-secondary/60">
      <Code
         class="pointer-events-none absolute -right-4 -bottom-6 rotate-12 text-white opacity-[0.04] transition-all duration-300 group-hover:scale-110 group-hover:opacity-[0.08]"
         size="8rem"
         :strokeWidth="3" />

      <div class="relative flex flex-1 flex-col gap-3">
         <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
               <div class="truncate font-mono st-font-body-bold text-white">
                  {{ fn.name }}
               </div>
               <div class="st-font-caption mt-1 text-accent-400">
                  {{
                     fn.activeVersion
                        ? `v${fn.activeVersion.version} · ${dayjs(fn.updatedAt).format('MM-DD HH:mm')}`
                        : '未发布'
                  }}
               </div>
            </div>
            <span
               class="mt-1 size-2 shrink-0 rounded-full"
               :class="
                  fn.enabled
                     ? 'bg-success shadow-[0_0_8px_var(--color-success)]'
                     : 'bg-accent-400'
               " />
         </div>

         <p class="line-clamp-2 min-h-[2.5rem] st-font-body-normal text-accent-300">
            {{ fn.description || '暂无描述' }}
         </p>

         <div class="mt-auto w-full">
            <StTagOverflow :items="tags" :counter-class="tagCounterClass" />
         </div>
      </div>
   </NuxtLink>
</template>
