<script setup lang="ts">
import { DoubleRight, SettingOne } from '@icon-park/vue-next';
import { onClickOutside } from '@vueuse/core';

/** 侧边栏「设置」下拉菜单：与计时器一致，按钮旁弹出、无遮罩、点击外部关闭 */
const opened = defineModel<boolean>('opened', { default: false });

/** 水合安全判定：SSR 与客户端首帧恒为 false，mounted 后移动端改用抽屉 */
const isMobile = useIsMobile();

const props = defineProps<{
   /** 传入做题页题目 id 才显示「重置题目」；无 id（如提交记录页）则只有空设置面板 */
   problemId?: number;
}>();

const rootRef = useTemplateRef<HTMLElement>('settings-root');

// 点击外部关闭（仅桌面弹出菜单；移动端抽屉内容 Teleport 到 body，
// 会被判为"外部"，不能参与该关闭逻辑）
onClickOutside(rootRef, () => {
   if (isMobile.value) return;
   opened.value = false;
});

const { emit: emitResetProject } = useEventEmitter<{ at: number }>(
   'challenge-settings',
   'reset-project',
);

/** 滑动轨道：按住滑块拖到最右侧即确认重置 */
const resetTrackRef = useTemplateRef<HTMLElement>('reset-track');
const resetHandleRef = useTemplateRef<HTMLElement>('reset-handle');
const resetDragOffset = ref(0);
const resetDragging = ref(false);
let resetDragStartX = 0;

const resetMaxOffset = () => {
   const track = resetTrackRef.value;
   const handle = resetHandleRef.value;
   if (!track || !handle) return 0;
   return Math.max(0, track.clientWidth - handle.offsetWidth);
};

const onResetDragStart = (e: PointerEvent) => {
   e.preventDefault();
   resetDragging.value = true;
   resetDragStartX = e.clientX - resetDragOffset.value;
   window.addEventListener('pointermove', onResetDragMove);
   window.addEventListener('pointerup', onResetDragEnd);
   window.addEventListener('pointercancel', onResetDragEnd);
};

const onResetDragMove = (e: PointerEvent) => {
   if (!resetDragging.value) return;
   resetDragOffset.value = Math.min(
      Math.max(e.clientX - resetDragStartX, 0),
      resetMaxOffset(),
   );
};

const onResetDragEnd = () => {
   window.removeEventListener('pointermove', onResetDragMove);
   window.removeEventListener('pointerup', onResetDragEnd);
   window.removeEventListener('pointercancel', onResetDragEnd);
   if (!resetDragging.value) return;
   resetDragging.value = false;
   if (resetDragOffset.value >= resetMaxOffset() - 1) {
      // 滑到最右侧：立即关闭菜单并弹出确认，淡出结束后再归位滑块，避免看到回弹动画
      opened.value = false;
      handleReset();
      setTimeout(() => {
         resetDragOffset.value = 0;
      }, 150);
      return;
   }
   resetDragOffset.value = 0;
};

onUnmounted(() => {
   window.removeEventListener('pointermove', onResetDragMove);
   window.removeEventListener('pointerup', onResetDragEnd);
   window.removeEventListener('pointercancel', onResetDragEnd);
});

const handleReset = async () => {
   const confirmed = await dialog.confirm({
      title: '重置题目',
      description: '你对题目的全部修改将被清空，恢复为初始模板。',
      variant: 'danger',
      confirmText: '确认重置',
      cancelText: '取消',
   });
   if (!confirmed) return;
   emitResetProject({ at: Date.now() });
   opened.value = false;
};
</script>

<template>
   <div ref="settings-root" class="relative">
      <StMiniSidebarButton
         name="设置"
         :class="{
            '!text-primary': opened,
         }"
         @click="opened = !opened">
         <SettingOne class="text-[1.1rem]" />
      </StMiniSidebarButton>

      <!-- 桌面端：按钮旁弹出菜单 -->
      <Transition
         enter-active-class="transition-all duration-100 ease-out"
         enter-from-class="opacity-0"
         enter-to-class="opacity-100"
         leave-active-class="transition-all duration-100 ease-in"
         leave-from-class="opacity-100"
         leave-to-class="opacity-0">
         <div
            v-if="!isMobile"
            v-show="opened"
            class="absolute top-1/2 -translate-y-1/2 left-[calc(100%+0.5rem)] w-72 p-4 bg-accent-600 rounded-xl shadow-2xl border border-accent-500 z-50">
            <template v-if="props.problemId">
               <h3 class="text-accent-100 font-medium mb-2">重置题目</h3>
               <p class="text-accent-200 text-xs mb-3 leading-5">
                  按住滑块拖到最右侧即可重置。你对题目的全部修改将被清空，恢复为初始模板。
               </p>
               <div
                  ref="reset-track"
                  class="relative h-10 rounded-full bg-accent-500/60 select-none">
                  <span
                     class="absolute inset-0 flex items-center justify-center text-sm text-accent-200 pointer-events-none transition-opacity"
                     :style="{ opacity: resetDragOffset > 0 ? 0.4 : 1 }">
                     按住并拖到最右侧
                  </span>
                  <div
                     ref="reset-handle"
                     class="absolute top-0 left-0 h-10 w-10 rounded-full bg-error text-white flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                     :class="{ 'transition-transform duration-150': !resetDragging }"
                     :style="{ transform: `translateX(${resetDragOffset}px) scale(${resetDragging ? 1.1 : 1})` }"
                     @pointerdown="onResetDragStart">
                     <DoubleRight class="text-[1.1rem]" />
                  </div>
               </div>
            </template>
            <span v-else class="text-accent-200 text-sm">暂无可用的设置项</span>
         </div>
      </Transition>

      <!-- 移动端：StDrawer 底部抽屉 -->
      <StDrawer v-if="isMobile" v-model:opened="opened" global fit width="18rem">
         <div class="w-72 max-w-full mx-auto p-4 max-md:pt-10 max-md:pb-4">
            <template v-if="props.problemId">
               <h3 class="text-accent-100 font-medium mb-2">重置题目</h3>
               <p class="text-accent-200 text-xs mb-3 leading-5">
                  按住滑块拖到最右侧即可重置。你对题目的全部修改将被清空，恢复为初始模板。
               </p>
               <div
                  ref="reset-track"
                  class="relative h-10 rounded-full bg-accent-500/60 select-none">
                  <span
                     class="absolute inset-0 flex items-center justify-center text-sm text-accent-200 pointer-events-none transition-opacity"
                     :style="{ opacity: resetDragOffset > 0 ? 0.4 : 1 }">
                     按住并拖到最右侧
                  </span>
                  <div
                     ref="reset-handle"
                     class="absolute top-0 left-0 h-10 w-10 rounded-full bg-error text-white flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                     :class="{ 'transition-transform duration-150': !resetDragging }"
                     :style="{ transform: `translateX(${resetDragOffset}px) scale(${resetDragging ? 1.1 : 1})` }"
                     @pointerdown="onResetDragStart">
                     <DoubleRight class="text-[1.1rem]" />
                  </div>
               </div>
            </template>
            <span v-else class="text-accent-200 text-sm">暂无可用的设置项</span>
         </div>
      </StDrawer>
   </div>
</template>
