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

const handleConfirm = async () => {
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

      <div class="flex justify-end gap-3">
         <button
            v-if="options.cancelable !== false"
            @click="handleCancel"
            class="cursor-pointer px-4 py-2 rounded-md bg-accent-500 hover:bg-accent-400 text-accent-100 transition-colors st-font-body-normal">
            {{ options.cancelText || '取消' }}
         </button>
         <button
            @click="handleConfirm"
            class="cursor-pointer px-4 py-2 rounded-md transition-colors st-font-body-normal"
            :class="
               options.variant === 'danger'
                  ? 'bg-error hover:bg-error/80 text-white'
                  : 'bg-primary hover:bg-primary/80 text-white'
            ">
            {{ options.confirmText || '确定' }}
         </button>
      </div>
   </div>
</template>
