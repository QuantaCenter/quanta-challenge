<script setup lang="ts">
import { HamburgerButton, Search } from '@icon-park/vue-next';
import Logo from '~/components/icon/Logo.vue';

const emit = defineEmits<{
   'open-drawer': [];
}>();

const { openSearch } = useSearch();
</script>

<template>
   <header
      class="fixed top-0 left-0 z-[1000] w-full h-14 px-4 flex items-center justify-between md:hidden bg-[#111111c4] backdrop-blur-xl">
      <NuxtLink to="/app/dashboard" aria-label="首页">
         <Logo class="scale-75 origin-left" />
      </NuxtLink>
      <StSpace gap="0.5rem" align="center">
         <button
            aria-label="搜索"
            class="size-10 flex items-center justify-center rounded-full text-white active:bg-accent-500 transition-colors cursor-pointer"
            @click="openSearch">
            <Search class="text-[1.375rem]" />
         </button>
         <button
            aria-label="展开菜单"
            class="size-10 flex items-center justify-center rounded-full text-white active:bg-accent-500 transition-colors cursor-pointer"
            @click="emit('open-drawer')">
            <HamburgerButton class="text-[1.375rem]" />
         </button>
      </StSpace>
   </header>
</template>
