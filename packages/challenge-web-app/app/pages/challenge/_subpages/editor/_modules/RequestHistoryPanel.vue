<script setup lang="ts">
import { Delete, History, Timer } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { METHOD_COLOR } from '../_composables/use-request-target';
import type { IRequestHistoryEntry } from '../_composables/use-request-history';

/** 请求历史列表：点一条即恢复当时的请求参数 */
defineProps<{ entries: IRequestHistoryEntry[] }>();

const emit = defineEmits<{
   restore: [entry: IRequestHistoryEntry];
   clear: [];
}>();

const time = (at: number) => dayjs(at).format('MM-DD HH:mm:ss');

const methodColor = (method: string) =>
   METHOD_COLOR[method as keyof typeof METHOD_COLOR] ?? 'text-accent-100';

const statusClass = (entry: IRequestHistoryEntry) => {
   if (entry.failed) return 'text-error';
   if (!entry.status) return 'text-accent-300';
   if (entry.status < 300) return 'text-success';
   if (entry.status < 400) return 'text-warning';
   return 'text-error';
};
</script>

<template>
   <StSpace fill direction="vertical" gap="0" class="bg-[#1F1F1F]">
      <StSpace
         fill-x
         align="center"
         justify="between"
         gap="0.5rem"
         class="shrink-0 px-4 py-3 border-b border-b-accent-600">
         <StSpace align="center" gap="0.5rem" class="min-w-0">
            <History class="text-accent-100 shrink-0" />
            <span class="st-font-body-bold text-white shrink-0">请求历史</span>
            <span class="st-font-caption text-accent-400 shrink-0">
               {{ entries.length }}
            </span>
         </StSpace>
         <StPopover v-if="entries.length" content="清空历史" :z-index="10005">
            <button
               type="button"
               aria-label="清空历史"
               class="flex size-6 items-center justify-center rounded-[0.375rem] text-accent-300 transition-colors cursor-pointer hover:bg-accent-600 hover:text-error"
               @click="emit('clear')">
               <Delete size="1rem" />
            </button>
         </StPopover>
      </StSpace>

      <StScrollable fill scrollY class="flex-1 min-h-0">
         <StSpace direction="vertical" gap="0.375rem" class="p-3">
            <button
               v-for="entry in entries"
               :key="entry.id"
               type="button"
               title="恢复这次请求的参数"
               class="w-full text-left rounded-[0.5rem] border border-accent-600 bg-accent-700/40 px-3 py-2 transition-colors cursor-pointer hover:border-primary/60 hover:bg-accent-600"
               @click="emit('restore', entry)">
               <StSpace align="center" gap="0.5rem" class="w-full">
                  <span
                     class="st-font-caption font-bold font-family-fira-code shrink-0"
                     :class="methodColor(entry.method)">
                     {{ entry.method }}
                  </span>
                  <span
                     class="st-font-tooltip font-family-fira-code text-accent-100 truncate flex-1 min-w-0">
                     {{ entry.pathname }}
                  </span>
                  <span
                     class="st-font-tooltip font-bold shrink-0"
                     :class="statusClass(entry)">
                     {{
                        entry.failed
                           ? '失败'
                           : entry.status
                             ? `${entry.status}`
                             : '--'
                     }}
                  </span>
               </StSpace>
               <StSpace align="center" gap="0.5rem" class="w-full mt-1">
                  <span class="st-font-tooltip text-accent-400 shrink-0">
                     {{ time(entry.at) }}
                  </span>
                  <span
                     v-if="entry.durationMs !== undefined"
                     class="flex items-center gap-1 st-font-tooltip text-accent-400 shrink-0">
                     <Timer />
                     {{ entry.durationMs }}ms
                  </span>
                  <span
                     v-if="entry.bodyText"
                     class="st-font-tooltip text-accent-400 shrink-0">
                     body
                  </span>
                  <span
                     v-if="entry.params.length"
                     class="st-font-tooltip text-accent-400 shrink-0">
                     {{ entry.params.length }} 参数
                  </span>
                  <span
                     v-if="entry.headers.length"
                     class="st-font-tooltip text-accent-400 shrink-0">
                     {{ entry.headers.length }} 请求头
                  </span>
               </StSpace>
            </button>

            <StEmptyStatus
               v-if="!entries.length"
               :icon="History"
               gap="0.75rem"
               content="还没有请求记录，点「发送」后这里会留下这一条"
               class="opacity-50" />
         </StSpace>
      </StScrollable>
   </StSpace>
</template>

<style lang="css" src="@/assets/css/utils.css" />
