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
const submitting = ref(false);

const handleConfirm = async () => {
   if (submitting.value) return;

   // 验证输入
   if (props.options.validator) {
      const result = props.options.validator(inputValue.value);
      if (result !== true) {
         errorMessage.value = typeof result === 'string' ? result : '输入无效';
         return;
      }
   }

   // onConfirm 失败时不关闭弹窗
   submitting.value = true;
   try {
      await props.options.onConfirm?.(inputValue.value);
   } catch (error) {
      errorMessage.value =
         error instanceof Error ? error.message : '提交失败，请稍后重试';
      return;
   } finally {
      submitting.value = false;
   }
   emits('confirm', inputValue.value);
};

const handleCancel = () => {
   if (submitting.value) return;
   emits('cancel');
};

const handleKeydown = (e: KeyboardEvent) => {
   if (e.key === 'Enter') {
      if (props.options.multiline && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      handleConfirm();
   } else if (e.key === 'Escape') {
      handleCancel();
   }
};

onMounted(() => {
   // 自动聚焦输入框
   nextTick(() => {
      const input = document.querySelector(`#${props.id}-input`) as
         | HTMLInputElement
         | HTMLTextAreaElement
         | null;
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
         <textarea
            v-if="options.multiline"
            :id="`${id}-input`"
            v-model="inputValue"
            rows="5"
            :maxlength="options.maxLength"
            :placeholder="options.placeholder"
            @keydown="handleKeydown"
            class="w-full px-3 py-2 bg-accent-700 border rounded-md text-accent-100 placeholder-accent-400 focus:outline-none focus:ring-2 focus:ring-primary st-font-body-normal transition-all resize-none"
            :class="errorMessage ? 'border-error' : 'border-accent-500'" />
         <input
            v-else
            :id="`${id}-input`"
            v-model="inputValue"
            :type="options.inputType || 'text'"
            :maxlength="options.maxLength"
            :placeholder="options.placeholder"
            @keydown="handleKeydown"
            class="w-full px-3 py-2 bg-accent-700 border rounded-md text-accent-100 placeholder-accent-400 focus:outline-none focus:ring-2 focus:ring-primary st-font-body-normal transition-all"
            :class="errorMessage ? 'border-error' : 'border-accent-500'" />
         <div class="flex justify-between gap-2 mt-1">
            <p class="text-error st-font-caption">
               {{ errorMessage }}
            </p>
            <span
               v-if="options.maxLength"
               class="text-accent-400 st-font-caption shrink-0 font-family-manrope">
               {{ inputValue.length }} / {{ options.maxLength }}
            </span>
         </div>
      </div>

      <div class="flex justify-end gap-3">
         <button
            v-if="options.cancelable !== false"
            :disabled="submitting"
            @click="handleCancel"
            class="px-4 py-2 rounded-md bg-accent-500 hover:bg-accent-400 text-accent-100 transition-colors st-font-body-normal cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {{ options.cancelText || '取消' }}
         </button>
         <button
            :disabled="submitting"
            @click="handleConfirm"
            class="px-4 py-2 rounded-md bg-primary hover:bg-primary/80 text-white transition-colors st-font-body-normal cursor-pointer disabled:opacity-50 disabled:cursor-wait">
            {{ options.confirmText || '确定' }}
         </button>
      </div>
   </div>
</template>
