<script setup lang="ts">
import { Close, SettingOne } from '@icon-park/vue-next';
import { useEventEmitter } from '~/composables/use-event-emitter';

const opened = defineModel<boolean>('opened', { default: false });

const props = defineProps<{
   /** 传入做题页题目 id 才显示「重置题目」；无 id（如提交记录页）则只有空设置面板 */
   problemId?: number;
}>();

const confirming = ref(false);

const { emit: emitResetProject } = useEventEmitter<{ at: number }>(
   'challenge-settings',
   'reset-project',
);

const handleReset = () => {
   emitResetProject({ at: Date.now() });
   confirming.value = false;
   opened.value = false;
};

watch(opened, (value) => {
   if (!value) confirming.value = false;
});
</script>

<template>
   <StModal v-model:opened="opened">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="bg-accent-600 rounded-xl p-6 min-w-[380px] max-w-[460px] border border-accent-500 text-white">
         <StSpace justify="between" align="center" fill-x>
            <StSpace align="center" gap="0.5rem">
               <SettingOne class="text-[1.25rem] text-accent-100" />
               <h2 class="text-xl font-semibold text-accent-50">设置</h2>
            </StSpace>
            <button
               class="text-accent-200 hover:text-accent-50 transition-colors cursor-pointer"
               aria-label="关闭设置"
               @click="opened = false">
               <Close />
            </button>
         </StSpace>

         <StSpace v-if="props.problemId" direction="vertical" gap="0.5rem" fill-x>
            <template v-if="!confirming">
               <button
                  class="w-full rounded-md bg-accent-500 hover:bg-accent-400 transition-colors text-accent-100 py-2 cursor-pointer"
                  @click="confirming = true">
                  重置题目
               </button>
            </template>
            <template v-else>
               <span class="text-accent-100 text-sm">
                  确认重置？你对题目的全部修改将被清空，恢复为初始模板。
               </span>
               <StSpace gap="0.5rem" fill-x>
                  <button
                     class="flex-1 rounded-md bg-accent-500 hover:bg-accent-400 transition-colors text-accent-100 py-2 cursor-pointer"
                     @click="confirming = false">
                     取消
                  </button>
                  <button
                     class="flex-1 rounded-md bg-error hover:opacity-90 transition-all text-white py-2 cursor-pointer"
                     @click="handleReset">
                     确认重置
                  </button>
               </StSpace>
            </template>
         </StSpace>
      </StSpace>
   </StModal>
</template>
