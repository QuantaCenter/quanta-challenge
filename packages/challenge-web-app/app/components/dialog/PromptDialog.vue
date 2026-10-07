<script setup lang="ts">
import type { PromptDialogOptions } from '~/composables/use-dialog';

const props = defineProps<{
   id: string;
   options: PromptDialogOptions;
}>();

const emits = defineEmits<{
   confirm: [value: string];
   cancel: [];
}>();

const inputValue = ref(props.options.defaultValue || '');
const errorMessage = ref<string>('');

const handleConfirm = async () => {
   // 验证输入
   if (props.options.validator) {
      const result = props.options.validator(inputValue.value);
      if (result !== true) {
         errorMessage.value = typeof result === 'string' ? result : '输入无效';
         return;
      }
   }

   await props.options.onConfirm?.(inputValue.value);
   emits('confirm', inputValue.value);
};

const handleCancel = () => {
   emits('cancel');
};

const handleKeydown = (e: KeyboardEvent) => {
   if (e.key === 'Enter') {
      handleConfirm();
   } else if (e.key === 'Escape') {
      handleCancel();
   }
};

onMounted(() => {
   // 自动聚焦输入框
   nextTick(() => {
      const input = document.querySelector(
         `#${props.id}-input`
      ) as HTMLInputElement;
      input?.focus();
   });
});
</script>

<template>
   <div
      class="bg-accent-600 rounded-lg shadow-2xl w-full max-w-md p-6 border border-accent-500">
      <h2
         v-if="options.title"
         class="st-font-body-bold text-white mb-2">
         {{ options.title }}
      </h2>
      <p
         v-if="options.description"
         class="st-font-body-normal text-accent-300 mb-4">
         {{ options.description }}
      </p>

      <div class="mb-6">
         <input
            :id="`${id}-input`"
            v-model="inputValue"
            :type="options.inputType || 'text'"
            :placeholder="options.placeholder"
            @keydown="handleKeydown"
            class="w-full px-3 py-2 bg-accent-700 border rounded-md text-accent-100 placeholder-accent-400 focus:outline-none focus:ring-2 focus:ring-primary st-font-body-normal transition-all"
            :class="errorMessage ? 'border-error' : 'border-accent-500'" />
         <p v-if="errorMessage" class="text-error st-font-caption mt-1">
            {{ errorMessage }}
         </p>
      </div>

      <div class="flex justify-end gap-3">
         <button
            v-if="options.cancelable !== false"
            @click="handleCancel"
            class="px-4 py-2 rounded-md bg-accent-500 hover:bg-accent-400 text-accent-100 transition-colors st-font-body-normal cursor-pointer">
            {{ options.cancelText || '取消' }}
         </button>
         <button
            @click="handleConfirm"
            class="px-4 py-2 rounded-md bg-primary hover:bg-primary/80 text-white transition-colors st-font-body-normal cursor-pointer">
            {{ options.confirmText || '确定' }}
         </button>
      </div>
   </div>
</template>
