<script setup lang="ts">
import { Down, Up } from '@icon-park/vue-next';

const sortOrder = defineModel<'asc' | 'desc'>({ required: true });
</script>

<template>
   <button
      type="button"
      :title="sortOrder === 'desc' ? '按创建时间降序，点击切换为升序' : '按创建时间升序，点击切换为降序'"
      @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
      class="flex items-center justify-center gap-2 h-[3.5rem] px-5 rounded-full border shrink-0 whitespace-nowrap cursor-pointer bg-accent-600 text-accent-100 border-accent-500/40 hover:border-white transition-colors">
      <Down v-if="sortOrder === 'desc'" class="text-[1.25rem]" aria-hidden="true" />
      <Up v-else class="text-[1.25rem]" aria-hidden="true" />
      <span class="font-family-manrope">{{ sortOrder === 'desc' ? '时间降序' : '时间升序' }}</span>
   </button>
</template>
