<script setup lang="ts">
import { Left, Right } from '@icon-park/vue-next';

/** 成员管理分页条。 */
const page = defineModel<number>('page', { required: true });

defineProps<{
   total: number;
   totalPages: number;
}>();
</script>

<template>
   <StSpace v-if="total > 0" fill-x justify="between" align="center">
      <span class="st-font-caption text-accent-300 font-family-manrope">
         第 {{ page }} / {{ totalPages }} 页
      </span>
      <StSpace gap="0.5rem">
         <button
            type="button"
            :disabled="page <= 1"
            class="flex items-center gap-1 px-4 py-2 bg-accent-600 border border-accent-500 rounded-[0.5rem] text-accent-300 st-font-caption hover:bg-accent-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-600 disabled:active:scale-100 cursor-pointer"
            @click="page -= 1">
            <Left size="1.25rem" class="shrink-0" />
            <span>上一页</span>
         </button>
         <button
            type="button"
            :disabled="page >= totalPages"
            class="flex items-center gap-1 px-4 py-2 bg-accent-600 border border-accent-500 rounded-[0.5rem] text-accent-300 st-font-caption hover:bg-accent-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-600 disabled:active:scale-100 cursor-pointer"
            @click="page += 1">
            <span>下一页</span>
            <Right size="1.25rem" class="shrink-0" />
         </button>
      </StSpace>
   </StSpace>
</template>
