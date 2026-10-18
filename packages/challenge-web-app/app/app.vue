<script setup lang="ts">
import useAuthStore from './stores/auth-store';

const authStore = useAuthStore();
onMounted(() => {
   authStore.initToken();
});
</script>

<template>
   <div
      class="bg-background text-white font-family-sans text-base md:min-w-[1440px]">
      <NuxtPage />
   </div>
</template>

<style lang="css">
.page-enter-active,
.page-leave-active {
   transition: all 0.15s ease-in-out;
}

.page-enter-from,
.page-leave-to {
   opacity: 0;
   transform: translateY(1rem);
}

.page-enter-to,
.page-leave-from {
   opacity: 1;
   transform: translateY(0);
}
</style>
