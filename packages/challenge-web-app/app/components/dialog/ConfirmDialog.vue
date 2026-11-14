<script setup lang="ts">
import type { ConfirmDialogOptions } from '~/composables/use-dialog';

const props = defineProps<{
   id: string;
   options: ConfirmDialogOptions;
}>();

const emits = defineEmits<{
   confirm: [];
   cancel: [];
}>();

const inputValue = ref('');
const copied = ref(false);
const copyError = ref('');
const canConfirm = computed(() => !props.options.confirmation ||
   inputValue.value === props.options.confirmation.value);

const copyConfirmation = async () => {
   if (!props.options.confirmation) return;
   copyError.value = '';
   try {
      await navigator.clipboard.writeText(props.options.confirmation.value);
      copied.value = true;
   } catch {
      copyError.value = '复制失败，请手动选择复制';
   }
};

const handleConfirm = async () => {
   if (!canConfirm.value) return;
   await props.options.onConfirm?.();
   emits('confirm');
};

const handleCancel = () => {
   emits('cancel');
};
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
         class="st-font-body-normal text-accent-300 mb-6">
         {{ options.description }}
      </p>
      <component
         v-else-if="options.content"
         :is="options.content"
         class="mb-6" />

      <div v-if="options.confirmation" class="mb-6">
         <div class="mb-2 flex min-w-0 items-baseline gap-1 text-accent-300 st-font-caption">
            <span class="shrink-0">请输入</span>
            <StPopover
               v-if="options.confirmation.copyable"
               :content="copied ? '已复制' : `点击复制${options.confirmation.label}`"
               placement="top"
               :z-index="10005"
               class="min-w-0">
               <StButton
                  size="sm"
                  :aria-label="`复制${options.confirmation.label}：${options.confirmation.value}`"
                  class="min-w-0 max-w-full !p-0 !bg-transparent !text-primary break-all text-left underline underline-offset-2"
                  @click="copyConfirmation">
                  {{ options.confirmation.value }}
               </StButton>
            </StPopover>
            <label
               v-else
               :for="`${id}-confirmation`"
               class="min-w-0 select-all break-all text-primary underline underline-offset-2">
               {{ options.confirmation.value }}
            </label>
         </div>
         <p v-if="copyError" role="alert" class="mb-2 text-error st-font-caption">
            {{ copyError }}
         </p>
         <StInput
            :id="`${id}-confirmation`"
            v-model:value="inputValue"
            type="text"
            autocomplete="off"
            :spellcheck="false"
            :placeholder="`请输入${options.confirmation.label}`"
            :aria-label="`请输入${options.confirmation.label}`"
            :status="inputValue && !canConfirm ? 'error' : 'default'"
            outer-class="w-full border border-accent-500 bg-accent-700 !px-3 !py-2 focus-within:ring-2 focus-within:ring-primary st-font-body-normal"
            @keydown.enter.prevent="handleConfirm" />
         <p v-if="inputValue && !canConfirm" role="status" class="mt-1 text-error st-font-caption">
            输入的{{ options.confirmation.label }}不一致
         </p>
      </div>

      <div class="flex justify-end gap-3">
         <StButton
            v-if="options.cancelable !== false"
            size="sm"
            bordered
            @click="handleCancel">
            {{ options.cancelText || '取消' }}
         </StButton>
         <StButton
            size="sm"
            :theme="options.variant === 'danger' ? 'danger' : 'primary'"
            :disabled="!canConfirm"
            @click="handleConfirm">
            {{ options.confirmText || '确定' }}
         </StButton>
      </div>
   </div>
</template>
