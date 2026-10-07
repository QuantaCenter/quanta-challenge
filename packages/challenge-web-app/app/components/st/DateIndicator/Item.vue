<script setup lang="ts">
import type { IDateIndicatorProps } from './type';

defineProps<IDateIndicatorProps>();
</script>

<template>
   <div
      class="relative flex flex-col gap-1 items-center px-[0.375rem] pt-2 pb-3 rounded-lg w-[2.0625rem]"
      :class="{
         'bg-secondary': triggered,
      }">
      <div
         class="text-[0.625rem]"
         :class="[
            triggered
               ? 'text-accent-500'
               : future
                 ? 'text-accent-400/70'
                 : 'text-accent-300',
         ]">
         {{ dateText }}
      </div>
      <div
         class="font-family-manrope font-bold leading-[80%]"
         :class="[
            triggered
               ? 'text-accent-700'
               : future
                 ? 'text-white/50'
                 : 'text-white',
         ]">
         {{ dateNumber }}
      </div>
      <div
         v-if="checked"
         class="size-[0.375rem] rounded-full bg-secondary absolute bottom-0"></div>
   </div>
</template>
