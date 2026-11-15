<script setup lang="ts">
import { Close, LoadingFour, Search } from '@icon-park/vue-next';

const query = defineModel<string>({ required: true });
withDefaults(defineProps<{
   placeholder: string;
   busy?: boolean;
   shortcut?: string;
   variant?: 'overlay' | 'integrated';
}>(), { variant: 'overlay' });
const input = ref<HTMLInputElement>();
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
   <div
      class="flex items-center"
      :class="variant === 'integrated'
         ? 'h-9 gap-2 px-3 bg-accent-600/50'
         : 'gap-3 p-4 bg-accent-700 rounded-xl border border-secondary ring-4 ring-secondary/10'">
      <LoadingFour
         v-if="busy"
         class="text-accent-300 animate-spin shrink-0"
         :class="variant === 'integrated' ? 'text-base' : 'text-xl'" />
      <Search
         v-else
         class="text-accent-300 shrink-0"
         :class="variant === 'integrated' ? 'text-base' : 'text-xl'" />
      <input
         ref="input"
         v-model="query"
         type="text"
         :aria-label="placeholder"
         :placeholder="placeholder"
         class="flex-1 min-w-0 bg-transparent border-none outline-none text-white text-sm placeholder:text-accent-300" />
      <button
         v-if="query"
         type="button"
         aria-label="清空搜索"
         class="text-accent-300 hover:text-white transition-colors p-1"
         @click="query = ''; input?.focus()">
         <Close class="text-base cursor-pointer" />
      </button>
      <div v-else-if="shortcut" class="hidden md:flex items-center gap-2 text-accent-300 text-xs">
         <kbd
            v-for="key in shortcut.split(' ')"
            :key="key"
            class="bg-accent-600 rounded border border-accent-500 h-6 px-1.5 flex items-center justify-center">
            {{ key }}
         </kbd>
      </div>
   </div>
</template>
