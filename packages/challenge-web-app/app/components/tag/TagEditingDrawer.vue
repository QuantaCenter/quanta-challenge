<script setup lang="ts">
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { Box } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

export type TagScope = 'problem' | 'workshop';

export type ITagEditingTarget = {
   tid: number;
   name: string;
   color?: string | null;
   description?: string | null;
   imageId?: string | null;
   imageUrl?: string | null;
   scope?: TagScope;
};

const props = defineProps<{
   /** 传入标签即为编辑模式，不传则为新建模式 */
   tag?: ITagEditingTarget | null;
   /** 新建时的标签用途，默认题目标签（编辑时以标签自身为准） */
   scope?: TagScope;
   /** 新建时预填的标签名（如覆盖内置工坊标签） */
   defaultName?: string;
}>();

const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits(['saved']);

const { $trpc } = useNuxtApp();
const message = useMessage();

const isEditing = computed(() => !!props.tag);
const currentScope = computed<TagScope>(
   () => props.tag?.scope ?? props.scope ?? 'problem',
);
/** 工坊标签：不需要颜色，图标可选（未上传时使用内置技术栈图标或通用图标） */
const isWorkshop = computed(() => currentScope.value === 'workshop');

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
            return !!value?.trim();
         },
      },
   ];
   if (!isWorkshop.value) {
      rules.push({
         field: 'color',
         required: true,
         validator(value) {
            return !!value;
         },
      });
   }
   // 编辑走的是部分更新，允许标签本身没有图标
   if (!isEditing.value && !isWorkshop.value) {
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
   formdata.name = tag?.name ?? props.defaultName ?? '';
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
   const name = formdata.name.trim();
   const submit = async () => {
      if (tag) {
         await $trpc.admin.tag.edit.mutate({
            tid: tag.tid,
            name,
            ...(isWorkshop.value ? {} : { color: formdata.color }),
            description: formdata.description,
            // 未重新上传时不动原有图标
            ...(formdata.imageId ? { imageId: formdata.imageId } : {}),
         });
         return;
      }
      await $trpc.admin.tag.add.mutate({
         name,
         scope: currentScope.value,
         ...(isWorkshop.value ? {} : { color: formdata.color }),
         ...(formdata.imageId ? { imageId: formdata.imageId } : {}),
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
         (error as Error)?.message || '请稍后重试'
      );
   } finally {
      loading.value = false;
   }
};

const enableSubmit = computed(() => {
   return form.value?.validate().success && !loading.value;
});

const title = computed(() => {
   const kind = isWorkshop.value ? '工坊标签' : '标签';
   return isEditing.value ? `编辑${kind}` : `新建${kind}`;
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6">
            <!-- Header -->
            <StSpace direction="vertical" gap="0.5rem">
               <h1 class="st-font-secondary-bold">{{ title }}</h1>
               <p v-if="isWorkshop" class="st-font-caption text-accent-300">
                  工坊标签显示在模板卡片底部，发布模板时可以选择。与内置标签同名时会覆盖内置标签的图标与说明。
               </p>
            </StSpace>
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
                           :placeholder="isWorkshop ? '技术栈名称，例如：Vue、Tailwind CSS' : '请输入标签名'"
                           :outer-class />
                     </StFormItem>
                     <StFormItem v-if="!isWorkshop" name="color" label="标签颜色" required>
                        <StColorPicker
                           v-model:value="formdata.color"
                           :outer-class />
                     </StFormItem>
                     <StFormItem
                        name="imageId"
                        :label="isWorkshop ? '标签图标（可选）' : '标签图标'"
                        :required="!isWorkshop">
                        <StUploadImage
                           v-model:image-id="formdata.imageId"
                           v-model:image-url="formdata.imageUrl"
                           class="bg-black !max-h-[12rem]"
                           image-max-height="4rem"
                           placeholder="请选择标签图标" />
                        <p v-if="isWorkshop" class="st-font-caption text-accent-400">
                           建议使用正方形透明背景图标；未上传时使用内置技术栈图标或通用标签图标。
                        </p>
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
