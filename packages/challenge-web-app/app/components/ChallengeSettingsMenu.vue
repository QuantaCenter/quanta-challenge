<script setup lang="ts">
import { SettingOne } from '@icon-park/vue-next';
import { onClickOutside } from '@vueuse/core';

/** 侧边栏「设置」下拉菜单：与计时器一致，按钮旁弹出、无遮罩、点击外部关闭 */
const opened = defineModel<boolean>('opened', { default: false });

const props = defineProps<{
   /** 传入做题页题目 id 才显示「重置题目」；无 id（如提交记录页）则只有空设置面板 */
   problemId?: number;
}>();

const rootRef = useTemplateRef<HTMLElement>('settings-root');

onClickOutside(rootRef, () => {
   opened.value = false;
});

const { emit: emitResetProject } = useEventEmitter<{ at: number }>(
   'challenge-settings',
   'reset-project',
);

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
            <button
               v-if="props.problemId"
               class="w-full rounded-md bg-error hover:opacity-90 transition-all text-white py-2 cursor-pointer"
               @click="handleReset">
               重置题目
            </button>
            <span v-else class="text-accent-200 text-sm">暂无可用的设置项</span>
         </div>
      </Transition>
   </div>
</template>
