<script setup lang="ts">
import { Delete } from '@icon-park/vue-next';

/** 「危险操作」卡片：删除云函数。 */
const emits = defineEmits<{
   delete: [];
}>();
</script>

<template>
   <section
      class="flex w-full items-center justify-between rounded-2xl border border-error/40 p-6">
      <StSpace direction="vertical" gap="0.25rem">
         <span class="st-font-body-bold text-error">删除云函数</span>
         <span class="st-font-caption text-accent-400">
            连同所有版本与调用记录一并删除，不可撤销
         </span>
      </StSpace>
      <StButton
         bordered
         theme="danger"
         class="py-[0.375rem] px-[1rem]"
         @click="emits('delete')">
         <div class="flex gap-2 items-center">
            <Delete class="text-[1.25rem]" />
            <span>删除</span>
         </div>
      </StButton>
   </section>
</template>
