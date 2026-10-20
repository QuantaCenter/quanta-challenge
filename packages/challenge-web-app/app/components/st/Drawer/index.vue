<script setup lang="ts">
import { Teleport } from 'vue';

const props = defineProps<{
   global?: boolean;
   width?: string;
}>();

const opened = defineModel<boolean>('opened', {
   default: false,
});
</script>

<template>
   <Component
      :is="global ? Teleport : 'div'"
      to="body"
      :class="{ 'pointer-events-none': !opened }"
      class="w-full h-full z-[9999]">
      <div
         @click.self="opened = false"
         :class="[
            global
               ? 'w-screen h-screen fixed top-0 left-0'
               : 'w-full h-full',
            { 'pointer-events-none': !opened },
            {
               'bg-background/50 backdrop-blur-xs': opened,
               'opacity-0': !opened,
            },
         ]"
         class="z-[9999] flex items-center justify-end overflow-hidden transition-all duration-300">
         <div
            class="h-screen w-fit bg-black border-l border-accent-600 text-white transition-all duration-300"
            :class="[opened ? 'right-0' : 'translate-x-full']"
            :style="{ width: props.width }">
            <slot></slot>
         </div>
      </div>
   </Component>
</template>
