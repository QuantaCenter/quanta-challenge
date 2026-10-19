<script setup lang="ts">
import defaultAvatar from '@/assets/images/default-avatar.webp';

const props = defineProps<{
   url?: string;
   size?: string;
}>();

const size = computed(() => {
   return props.size || '3rem';
});
const url = computed(() => {
   return props.url || defaultAvatar;
});
</script>

<template>
   <div
      :style="{
         width: size,
         height: size,
      }"
      class="rounded-full flex items-center justify-center overflow-hidden">
      <img :src="url" alt="头像" class="w-full h-full object-cover" />
   </div>
</template>
