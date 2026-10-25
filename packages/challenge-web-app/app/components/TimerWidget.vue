<script setup lang="ts">
import { Timer } from '@icon-park/vue-next';
import { ref, nextTick } from 'vue';
import { onClickOutside } from '@vueuse/core';
import TimerMenuPanel from './TimerMenuPanel.vue';

const props = defineProps<{ toolbar?: boolean }>();

/** 水合安全判定：SSR 与客户端首帧恒为 false，mounted 后才切换容器 */
const isMobile = useIsMobile();

const showMenu = ref(false);
type TimerStatus = 'idle' | 'running' | 'paused';
const timerStatus = ref<TimerStatus>('idle');

// 获取按钮和菜单的引用
const buttonRef = useTemplateRef<HTMLElement>('timer-button');
const menuRef = useTemplateRef<HTMLElement>('timer-menu');
const menuContentRef = useTemplateRef<HTMLElement>('menu-content');

// 动态高度控制（仅桌面弹出菜单使用）
const menuHeight = ref<string>('auto');

// 更新菜单高度
const updateMenuHeight = async () => {
   // 等待动画完成
   await nextTick();

   // 计算内容高度
   if (menuContentRef.value) {
      const height = menuContentRef.value.offsetHeight;
      menuHeight.value = `${height}px`;
   }
};

// 仅桌面弹出菜单参与点击外部关闭
onClickOutside(
   menuRef,
   () => {
      if (isMobile.value) return;
      showMenu.value = false;
   },
   { ignore: [buttonRef.value] },
);

// 切换菜单显示
const toggleMenu = () => {
   showMenu.value = !showMenu.value;
   if (showMenu.value && !isMobile.value) {
      // 菜单打开时更新高度
      nextTick(() => {
         updateMenuHeight();
      });
   }
};

// 面板模式 / 状态变化：同步触发按钮颜色，桌面弹出菜单重算高度
const onPanelChange = (status: TimerStatus) => {
   timerStatus.value = status;
   if (!isMobile.value) updateMenuHeight();
};
</script>

<template>
   <div class="relative">
      <!-- 触发按钮 -->
      <div ref="timer-button">
         <StMiniSidebarButton
            name="计时器"
            @click="toggleMenu"
            :class="[
               props.toolbar
                  ? '!px-0 !py-0 !size-[2.75rem] flex items-center justify-center'
                  : '!px-4',
               'transition-colors',
               {
                  '!text-warning': timerStatus === 'idle',
                  '!text-success': timerStatus === 'running',
                  '!text-primary': timerStatus === 'paused',
               },
            ]">
            <Timer class="text-[1.1rem]" />
         </StMiniSidebarButton>
      </div>

      <Transition
         enter-active-class="transition-all duration-100 ease-out"
         enter-from-class="opacity-0"
         enter-to-class="opacity-100"
         leave-active-class="transition-all duration-100 ease-in"
         leave-from-class="opacity-100"
         leave-to-class="opacity-0">
         <div
            v-if="!isMobile"
            v-show="showMenu"
            ref="timer-menu"
            :class="[
               'absolute w-80 bg-accent-600 rounded-xl shadow-2xl border border-accent-500 z-50',
               props.toolbar
                  ? 'top-1/2 -translate-y-1/2 left-[calc(100%+0.5rem)]'
                  : 'top-full right-0 mt-2 translate-x-32',
            ]">
            <!-- 外部容器 - relative，动态高度 -->
            <div
               ref="menu-container"
               class="relative overflow-hidden transition-all duration-300 ease-out"
               :style="{ height: menuHeight }">
               <!-- 内容容器 - absolute -->
               <div ref="menu-content" class="absolute top-0 left-0 w-full">
                  <TimerMenuPanel @change="onPanelChange" />
               </div>
            </div>
         </div>
      </Transition>

      <StDrawer
         v-if="isMobile"
         v-model:opened="showMenu"
         global
         fit
         width="20rem">
         <div class="w-[20rem] max-w-full mx-auto max-md:pt-10 max-md:pb-4">
            <TimerMenuPanel @change="onPanelChange" />
         </div>
      </StDrawer>
   </div>
</template>
