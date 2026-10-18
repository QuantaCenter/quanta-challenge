<script setup lang="ts">
import { Remind, Search } from '@icon-park/vue-next';
import Logo from '~/components/icon/Logo.vue';

defineProps<{
   unreadCount: number;
}>();

const emit = defineEmits<{
   search: [];
   notification: [];
}>();
</script>

<template>
   <header
      class="fixed top-0 left-0 right-0 h-[3.5rem] z-[1000] flex items-center justify-between pl-4 pr-6 bg-[#111111c4] backdrop-blur-md">
      <Logo class="h-6 w-auto" />
      <div class="flex items-center gap-5 text-accent-100">
         <button class="p-1" @click="emit('search')">
            <Search class="text-[1.375rem]" />
         </button>
         <button class="relative p-1" @click="emit('notification')">
            <Remind class="text-[1.375rem]" />
            <div
               v-if="unreadCount > 0"
               class="absolute top-0 right-0 min-w-[1rem] h-4 px-[0.25rem] flex items-center justify-center bg-rose-500 text-white text-[0.625rem] font-bold rounded-full shadow-sm border-2 border-background z-10 pointer-events-none select-none leading-none font-family-manrope translate-x-1/2 -translate-y-1/4">
               {{ unreadCount > 99 ? '99+' : unreadCount }}
            </div>
         </button>
      </div>
   </header>
</template>
