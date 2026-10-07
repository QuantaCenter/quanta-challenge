<script setup lang="ts">
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { Box } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

export type ITagEditingTarget = {
   tid: number;
   name: string;
   color?: string | null;
   description?: string | null;
   imageId?: string | null;
   imageUrl?: string | null;
};

const props = defineProps<{
   /** 传入标签即为编辑模式，不传则为新建模式 */
   tag?: ITagEditingTarget | null;
}>();

const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits(['saved']);

const { $trpc } = useNuxtApp();
const message = useMessage();

const isEditing = computed(() => !!props.tag);

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const formdata = reactive({
   name: '',
   description: '',
   color: '#FA7C0E',
   imageId: '',
   imageUrl: '',
});

const rules = computed<IRule[]>(() => {
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
   ];
   // 编辑走的是部分更新，允许标签本身没有图标
   if (!isEditing.value) {
      rules.push({
         field: 'imageId',
         required: true,
         validator(value) {
            return !!value;
         },
      });
   }
   return rules;
});

/** 每次打开都换 key，让表单连同校验状态一起重建 */
const formKey = ref(0);
const form = useTemplateRef<InstanceType<typeof StForm>>('form');

const fillForm = (tag?: ITagEditingTarget | null) => {
   formdata.name = tag?.name ?? '';
   formdata.description = tag?.description ?? '';
   formdata.color = tag?.color ?? '#FA7C0E';
   formdata.imageId = tag?.imageId ?? '';
   formdata.imageUrl = tag?.imageUrl ?? '';
};

watch(opened, (isOpened) => {
   if (!isOpened) return;
   fillForm(props.tag);
   formKey.value += 1;
});

const loading = ref(false);

const handleSubmit = async () => {
   if (!form.value?.validate().success) return;

   const tag = props.tag;
   const submit = async () => {
      if (tag) {
         await $trpc.admin.tag.edit.mutate({
            tid: tag.tid,
            name: formdata.name,
            color: formdata.color,
            description: formdata.description,
            // 未重新上传时不动原有图标
            ...(formdata.imageId ? { imageId: formdata.imageId } : {}),
         });
         return;
      }
      await $trpc.admin.tag.add.mutate({
         name: formdata.name,
         color: formdata.color,
         imageId: formdata.imageId,
         description: formdata.description,
      });
   };

   loading.value = true;
   try {
      await atLeastTime(200, submit());
      emits('saved');
      opened.value = false;
   } catch (error) {
      console.error('保存标签失败', error);
      message.error(
         isEditing.value ? '标签更新失败' : '标签创建失败',
         '请稍后重试'
      );
   } finally {
      loading.value = false;
   }
};

const enableSubmit = computed(() => {
   return form.value?.validate().success && !loading.value;
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6">
            <!-- Header -->
            <h1 class="st-font-secondary-bold">
               {{ isEditing ? '编辑标签' : '新建标签' }}
            </h1>
            <StSpace fill class="relative overflow-auto">
               <StForm
                  :key="formKey"
                  ref="form"
                  v-model:model-value="formdata"
                  :rules="rules"
                  class="w-full absolute top-0 left-0">
                  <StSpace direction="vertical" gap="1.5rem" fill-x>
                     <StFormItem name="name" label="标签名" required>
                        <StInput
                           v-model:value="formdata.name"
                           placeholder="请输入标签名"
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
                           v-model:image-url="formdata.imageUrl"
                           class="bg-black !max-h-[12rem]"
                           image-max-height="4rem"
                           placeholder="请选择标签图标" />
                     </StFormItem>
                     <StFormItem name="description" label="标签描述">
                        <StTextarea
                           v-model:value="formdata.description"
                           placeholder="请输入标签描述"
                           :outer-class />
                     </StFormItem>
                  </StSpace>
               </StForm>
            </StSpace>
         </StSpace>
         <!-- Bottom -->
         <StSpace justify="end" class="p-4 pt-0 w-full">
            <StButton
               @click="handleSubmit"
               :loading="loading"
               :disabled="!enableSubmit"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
               <div class="flex gap-2 items-center">
                  <Box class="text-[1.25rem]" />
                  <span>{{ isEditing ? '保存' : '创建' }}</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
