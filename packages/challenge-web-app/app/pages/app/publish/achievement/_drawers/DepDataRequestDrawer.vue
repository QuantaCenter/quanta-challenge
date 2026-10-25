<script setup lang="ts">
import type { StForm, StSelect } from '#components';
import type { $Enums } from '@prisma/client';
import { type IRule } from '~/components/st/Form/type';
import { useMessage } from '~/components/st/Message/use-message';
import type { ISelectOption } from '~/components/st/Select/type';

defineProps<{
   outerClass?: string;
}>();

const opened = defineModel<boolean>('opened', { default: false });

const form = useTemplateRef<InstanceType<typeof StForm>>('form');
const formdata = reactive({
   name: '',
   description: '',
   sql: '',
   type: '' as $Enums.AchievementDepDataType,
});

const rules = ref<IRule[]>([
   {
      field: 'name',
      required: true,
      validator(value) {
         return /^[A-Za-z_][A-Za-z0-9_]+$/.test(value);
      },
   },
   {
      field: 'description',
      required: true,
      validator(value) {
         return !!value && value.length <= 50;
      },
   },
   {
      field: 'sql',
      required: true,
      validator(value) {
         return !!value;
      },
   },
   {
      field: 'type',
      required: true,
      validator(value) {
         return !!value;
      },
   },
]);

const enableSubmit = ref(false);
watch(
   formdata,
   () => {
      if (!form.value) {
         enableSubmit.value = false;
         return;
      }
      enableSubmit.value = form.value?.validate().success;
   },
   { deep: true }
);

const { $trpc } = useNuxtApp();
const successEmitter = useEventBus('achievement-dep-data-requested-success');
const message = useMessage();
const loading = ref(false);
const handleSubmit = async () => {
   if (!form.value?.validate().success) return;

   const dataToSubmit = {
      name: formdata.name,
      description: formdata.description,
      sql: formdata.sql,
      type: formdata.type,
   };

   dataToSubmit.sql = dataToSubmit.sql
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('--'))
      .join(' ');

   try {
      loading.value = true;
      await atLeastTime(
         200,
         $trpc.admin.achievement.requestDepDataLoader.mutate(dataToSubmit)
      );
      message.success('申请成功');
      successEmitter.emit();
      opened.value = false;
      formdata.name = '';
      formdata.description = '';
      formdata.sql = '';
      formdata.type = '' as $Enums.AchievementDepDataType;
   } catch (e: any) {
      console.error(e);
      message.error('申请失败', e.message, { duration: 0 });
      return;
   } finally {
      loading.value = false;
   }
};

const typeSelect = useTemplateRef<InstanceType<typeof StSelect>>('select');
watch(opened, (newValue) => {
   if (newValue && typeSelect.value) {
      setTimeout(() => {
         typeSelect.value!.updatePopper();
      }, 300);
   }
});

const typeOptions: ISelectOption[] = [
   { label: '数值型', value: 'NUMERIC' },
   { label: '布尔型', value: 'BOOLEAN' },
   { label: '文本型', value: 'TEXT' },
];
const getTypePreview = (value: string) => {
   return typeOptions.find((option) => option.value === value)?.label || '';
};

const { containerKey, onEditorContentChanged } = useSimpleEditor({
   script:
      '-- 请输入获取数据的SQL语句，必须为 SELECT 语句\nSELECT COUNT(*) FROM users;',
   language: 'sql',
});
onEditorContentChanged((content) => {
   formdata.sql = content;
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="1rem" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6">
            <!-- Header -->
            <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">申请依赖数据</h1>
            <StSpace fill class="relative overflow-auto">
               <StForm
                  ref="form"
                  v-model:model-value="formdata"
                  :rules="rules"
                  class="w-full absolute top-0 left-0">
                  <StSpace direction="vertical" gap="1.5rem" fill-x>
                     <StFormItem name="name" label=" 数据变量名" required>
                        <StInput
                           v-model:value="formdata.name"
                           placeholder="请输入使用字母、数字或下划线组成的变量名"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="description" label="数据描述" required>
                        <StTextarea
                           v-model:value="formdata.description"
                           placeholder="请输入数据描述"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="type" label="数据类型" required>
                        <StSelect
                           ref="select"
                           v-model:value="formdata.type"
                           placeholder="请选择数据类型"
                           optionsContainerClass="z-[10000]"
                           attach-to-body
                           close-on-click-outside
                           :outer-class
                           :options="typeOptions">
                           <template #selected-preview>
                              <div class="text-white">
                                 {{ getTypePreview(formdata.type) }}
                              </div>
                           </template>
                        </StSelect>
                     </StFormItem>
                     <StFormItem name="sql" label="数据查询SQL" required>
                        <main :ref="containerKey" class="h-40"></main>
                     </StFormItem>
                  </StSpace>
               </StForm>
            </StSpace>
         </StSpace>
         <!-- BUTTOM -->
         <StSpace justify="end" class="p-4 w-full">
            <StButton
               @click="handleSubmit"
               :loading="loading"
               :disabled="!enableSubmit"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
               <div class="flex gap-2 items-center tracking-wider">
                  <span>申请</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
