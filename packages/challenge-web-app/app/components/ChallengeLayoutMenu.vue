<script setup lang="ts">
import { LayoutFour } from '@icon-park/vue-next';
import { onClickOutside } from '@vueuse/core';

/** 侧边栏「布局」下拉菜单：与计时器一致，按钮旁弹出、无遮罩、点击外部关闭 */
const opened = defineModel<boolean>('opened', { default: false });

const layoutStore = useLayoutStore();

const rootRef = useTemplateRef<HTMLElement>('layout-root');

onClickOutside(rootRef, () => {
   opened.value = false;
});

const handleReset = () => {
   layoutStore.resetLayout();
   opened.value = false;
};
</script>

<template>
   <div ref="layout-root" class="relative">
      <StMiniSidebarButton
         name="布局"
         :class="{
            '!text-primary': opened,
         }"
         @click="opened = !opened">
         <LayoutFour class="text-[1.1rem]" />
      </StMiniSidebarButton>

      <Transition
         enter-active-class="transition-all duration-100 ease-out"
         enter-from-class="opacity-0"
         enter-to-class="opacity-100"
         leave-active-class="transition-all duration-100 ease-in"
         leave-from-class="opacity-100"
         leave-to-class="opacity-0">
         <div
            v-show="opened"
            class="absolute top-1/2 -translate-y-1/2 left-[calc(100%+0.5rem)] w-72 p-4 bg-accent-600 rounded-xl shadow-2xl border border-accent-500 z-50">
            <StSpace direction="vertical" gap="1.25rem" fill-x>
               <StSpace justify="between" align="center" gap="1rem" fill-x>
                  <span class="text-accent-100">锁定面板拖拽</span>
                  <StSwitch v-model="layoutStore.locked" />
               </StSpace>

               <button
                  class="w-full rounded-md bg-accent-500 hover:bg-accent-400 transition-colors text-accent-100 py-2 cursor-pointer"
                  @click="handleReset">
                  恢复默认布局
               </button>
            </StSpace>
         </div>
      </Transition>
   </div>
</template>
