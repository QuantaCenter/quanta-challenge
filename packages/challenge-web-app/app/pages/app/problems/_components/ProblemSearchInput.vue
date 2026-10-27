<script setup lang="ts">
import { Search, CloseSmall } from '@icon-park/vue-next';

const keyword = defineModel<string>('value', {
   default: '',
});

const inputRef = ref<HTMLInputElement | null>(null);

const clearKeyword = () => {
   keyword.value = '';
   inputRef.value?.focus();
};
</script>

<template>
   <div
      class="flex items-center gap-2 bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[16rem] max-md:w-auto max-md:flex-1 max-md:min-w-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50">
      <Search class="text-accent-300 text-lg shrink-0" />
      <input
         ref="inputRef"
         v-model="keyword"
         type="text"
         placeholder="搜索题目..."
         class="flex-1 bg-transparent border-none outline-none text-white placeholder:text-accent-400 text-sm" />
      <button
         v-if="keyword"
         @click="clearKeyword"
         class="text-accent-300 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-accent-500">
         <CloseSmall class="text-lg" />
      </button>
   </div>
</template>
