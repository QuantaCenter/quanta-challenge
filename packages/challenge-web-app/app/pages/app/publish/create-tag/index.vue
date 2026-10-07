<script setup lang="ts">
import { Plus, Tag } from '@icon-park/vue-next';
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { useMessage } from '~/components/st/Message/use-message';

useSeoMeta({ title: '创建标签 - Quanta Challenge' });

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const { $trpc } = useNuxtApp();
const message = useMessage();

const formdata = reactive({
   name: '',
   description: '',
   color: '#FA7C0E',
   imageId: '',
});

const rules: IRule[] = [
   {
      field: 'name',
      required: true,
      validator(value) {
         return !!value;
      },
   },
   {
      field: 'color',
      required: true,
      validator(value) {
         return !!value;
      },
   },
   {
      field: 'imageId',
      required: true,
      validator(value) {
         return !!value;
      },
   },
];

const form = useTemplateRef<InstanceType<typeof StForm>>('form');
const createLoading = ref(false);

const handleCreate = async () => {
   if (!form.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error('表单填写有误', `请检查 ${invalidField} 项`);
      return;
   }

   createLoading.value = true;
   try {
      await $trpc.admin.tag.add.mutate({
         name: formdata.name,
         color: formdata.color,
         imageId: formdata.imageId,
         description: formdata.description,
      });
      message.success('标签创建成功');
      navigateTo('/app/publish');
   } catch (error) {
      console.error('创建标签失败', error);
      message.error('标签创建失败', '请稍后重试');
   } finally {
      createLoading.value = false;
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">创建标签</h1>
         <StForm
            ref="form"
            v-model:model-value="formdata"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <StFormItem name="name" label="标签名" required>
                  <StInput
                     v-model:value="formdata.name"
                     placeholder="请输入标签名"
                     name="name"
                     :outer-class />
               </StFormItem>
               <StFormItem name="color" label="标签颜色" required>
                  <StColorPicker
                     v-model:value="formdata.color"
                     :outer-class />
               </StFormItem>
               <StFormItem name="imageId" label="标签图标" required>
                  <StUploadImage
                     v-model:image-id="formdata.imageId"
                     :icon="Tag"
                     placeholder="请选择标签图标" />
               </StFormItem>
               <StFormItem name="description" label="标签描述">
                  <StTextarea
                     v-model:value="formdata.description"
                     placeholder="请输入标签描述"
                     :outer-class />
               </StFormItem>
            </StSpace>
            <StSpace justify="end" align="center" class="px-2 mt-[2.13rem]">
               <StButton
                  :loading="createLoading"
                  @click="handleCreate"
                  class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
                  <div class="flex gap-2 items-center">
                     <Plus class="text-[1.5rem]" />
                     <span>创建标签</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
