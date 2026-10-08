<script setup lang="ts">
import { Plus } from '@icon-park/vue-next';

/** 云函数网格里的「新建云函数」虚线条目。 */
const emits = defineEmits<{
   click: [];
}>();
</script>

<template>
   <button
      type="button"
      class="group flex min-h-[13.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-accent-400 transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
      @click="emits('click')">
      <div
         class="flex items-center justify-center size-12 rounded-full bg-accent-600 text-accent-300 transition-colors group-hover:bg-primary/15 group-hover:text-primary">
         <Plus class="text-[1.5rem]" />
      </div>
      <span
         class="st-font-caption text-accent-300 transition-colors group-hover:text-primary">
         新建云函数
      </span>
   </button>
</template>
