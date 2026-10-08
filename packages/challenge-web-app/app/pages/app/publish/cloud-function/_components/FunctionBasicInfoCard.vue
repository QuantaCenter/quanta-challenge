<script setup lang="ts">
import { Save, SettingTwo } from '@icon-park/vue-next';
import type { ICloudFunctionForm } from '../_composables/use-cloud-function-detail';

/** 「基本信息」卡片：描述 / KV 隔离 / 超时 / 启用状态。 */
const form = defineModel<ICloudFunctionForm>('form', { required: true });

defineProps<{
   saving: boolean;
}>();

const emits = defineEmits<{
   save: [];
}>();

const outerClass = 'border !py-3 !px-4 !rounded-[0.5rem] w-full';
</script>

<template>
   <section class="w-full rounded-2xl border border-accent-500 p-6">
      <StSpace align="center" gap="0.625rem" class="mb-5">
         <SettingTwo class="text-[1.375rem] text-accent-200" />
         <h2 class="st-font-third-bold text-white">基本信息</h2>
      </StSpace>

      <StSpace direction="vertical" gap="1.25rem" class="w-full">
         <StSpace direction="vertical" gap="0.5rem" class="w-full">
            <label class="st-font-caption text-accent-200">描述</label>
            <StTextarea
               v-model:value="form.description"
               placeholder="这个函数用来做什么"
               :outer-class="outerClass" />
         </StSpace>

         <StSpace align="center" justify="between" class="w-full">
            <StSpace direction="vertical" gap="0.25rem">
               <span class="st-font-body-bold text-accent-100">
                  KV 按用户隔离
               </span>
               <span class="st-font-caption text-accent-400">
                  关闭后所有调用者共享同一份 KV，请谨慎使用
               </span>
            </StSpace>
            <StSwitch v-model="form.kvUserIsolated" />
         </StSpace>

         <StSpace align="center" justify="between" class="w-full">
            <StSpace direction="vertical" gap="0.25rem">
               <span class="st-font-body-bold text-accent-100">
                  单次调用超时
               </span>
               <span class="st-font-caption text-accent-400">
                  毫秒，100 ~ 30000
               </span>
            </StSpace>
            <StInput
               v-model:value="form.timeoutMs"
               type="number"
               outer-class="border !py-2 !px-3 !rounded-[0.5rem] w-[8rem]" />
         </StSpace>

         <StSpace align="center" justify="between" class="w-full">
            <StSpace direction="vertical" gap="0.25rem">
               <span class="st-font-body-bold text-accent-100">启用状态</span>
               <span class="st-font-caption text-accent-400">
                  停用后拒绝所有调用（历史与版本保留）
               </span>
            </StSpace>
            <StSwitch v-model="form.enabled" />
         </StSpace>

         <StSpace justify="end" class="w-full">
            <StButton
               :loading="saving"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.5rem]"
               @click="emits('save')">
               <div class="flex gap-2 items-center">
                  <Save class="text-[1.25rem]" />
                  <span>保存</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </section>
</template>
