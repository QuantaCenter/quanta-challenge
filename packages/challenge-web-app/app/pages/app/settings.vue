<script setup lang="ts">
import { LayoutFour, Protect } from '@icon-park/vue-next';

useSeoMeta({ title: '设置 - Quanta Challenge' });

const route = useRoute();

const settingsOptions = shallowRef([
   {
      label: '常规',
      value: 'general',
      color: '#4ADE80',
      icon: LayoutFour,
   },
   {
      label: '安全',
      value: 'security',
      color: '#60A5FA',
      icon: Protect,
   },
]);
const activeKey = ref();

watch(
   () => route.path,
   (newPath) => {
      if (newPath.includes('security')) {
         activeKey.value = 'security';
      } else {
         activeKey.value = 'general';
      }
      window !== void 0 && scrollTo({ top: 0, behavior: 'smooth' });
   },
   { immediate: true },
);

watch(
   () => activeKey.value,
   (newKey) => {
      if (newKey === 'general') {
         navigateTo('/app/settings');
      } else if (newKey === 'security') {
         navigateTo('/app/settings/security');
      }
   },
);
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         fill-x
         direction="vertical"
         class="max-w-[45rem] pb-48 h-screen relative">
         <StSpace
            fill-x
            direction="vertical"
            class="sticky !w-full !max-w-[45rem] top-4 mt-6 bg-background z-[100]">
            <h1 class="text-[2.5rem] font-bold text-white">设置</h1>

            <StSpace align="center" gap="0.75rem">
               <StTagButton
                  v-for="opt in settingsOptions"
                  @click="activeKey = opt.value"
                  :selected="opt.value === activeKey"
                  :key="opt.value"
                  :icon="opt.icon"
                  :tag="{ name: opt.label }" />
            </StSpace>

            <div class="w-full h-[1px] shrink-0 bg-accent-600"></div>
         </StSpace>

         <div class="w-full px-4">
            <NuxtPage />
         </div>
      </StSpace>
   </StSpace>
</template>
