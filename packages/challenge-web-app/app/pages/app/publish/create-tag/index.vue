<script setup lang="ts">
import type { DefineComponent } from 'vue';
import { Plus, Tag } from '@icon-park/vue-next';
import { LAB_CATEGORY_ICON_NAMES } from '@challenge/shared/lab-templates';
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { useMessage } from '~/components/st/Message/use-message';
import { labCategoryIcon } from '~/utils/lab-category-icons';

useSeoMeta({ title: '创建标签 - Quanta Challenge' });

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const route = useRoute();
const { $trpc } = useNuxtApp();
const message = useMessage();

/**
 * 标签类型：
 * - problem：题目标签（题目分类与筛选）；
 * - lab-category：模板分类（实验室页的分类筛选页签、模板卡片右上角的分类标签）；
 * - lab：技术栈标签（模板卡片底部的小标签）。
 */
type CreateScope = 'problem' | 'lab-category' | 'lab';
const scopeOptions = [
   { label: '题目标签', value: 'problem', color: '#FA7C0E' },
   { label: '模板分类', value: 'lab-category', color: '#38BDF8', contrastText: true },
   { label: '技术栈标签', value: 'lab', color: '#A78BFA', contrastText: true },
];
const SCOPE_HINT: Record<CreateScope, string> = {
   problem: '题目标签用于题目分类与筛选，发布题目时可以选择。',
   'lab-category':
      '模板分类显示为实验室页顶部的分类筛选页签，以及模板卡片右上角的分类标签；发布实验室模板时选择。',
   lab: '技术栈标签显示在实验室模板卡片底部，发布实验室模板时可以多选。',
};

const initialScope = (): CreateScope =>
   route.query.scope === 'lab' || route.query.scope === 'lab-category'
      ? route.query.scope
      : 'problem';

const formdata = reactive({
   scope: initialScope(),
   name: '',
   description: '',
   color: '#FA7C0E',
   imageId: '',
   /** 模板分类的页签图标 */
   icon: 'components' as string,
});

const isProblem = computed(() => formdata.scope === 'problem');
const isCategory = computed(() => formdata.scope === 'lab-category');
const isLabTag = computed(() => formdata.scope === 'lab');

// 切换类型时给出合适的默认颜色
watch(
   () => formdata.scope,
   (scope) => {
      if (scope === 'lab-category' && formdata.color === '#FA7C0E') formdata.color = '#38BDF8';
      if (scope === 'problem' && formdata.color === '#38BDF8') formdata.color = '#FA7C0E';
   },
);

const categoryIconOptions = LAB_CATEGORY_ICON_NAMES.map((name) => ({
   value: name,
   icon: labCategoryIcon(name),
}));

const rules = computed<IRule[]>(() => [
   {
      field: 'name',
      required: true,
      validator(value) {
         const name = value?.trim() ?? '';
         return !!name && (!isCategory.value || name.length <= 12);
      },
   },
   // 技术栈标签不需要颜色
   ...(isLabTag.value
      ? []
      : [
           {
              field: 'color',
              required: true,
              validator: (value: string) => !!value,
           },
        ]),
   // 只有题目标签必须上传图标
   ...(isProblem.value
      ? [
           {
              field: 'imageId',
              required: true,
              validator: (value: string) => !!value,
           },
        ]
      : []),
]);

const form = useTemplateRef<InstanceType<typeof StForm>>('form');
const createLoading = ref(false);

const submitLabel = computed(
   () => ({ problem: '创建标签', 'lab-category': '创建模板分类', lab: '创建技术栈标签' })[formdata.scope],
);

const handleCreate = async () => {
   if (!form.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error(
         '表单填写有误',
         invalidField === 'name' && isCategory.value
            ? '分类名称需为 1～12 个字符'
            : `请检查 ${invalidField} 项`,
      );
      return;
   }

   createLoading.value = true;
   try {
      if (isCategory.value) {
         await $trpc.admin.labCategory.create.mutate({
            name: formdata.name.trim(),
            description: formdata.description.trim(),
            color: formdata.color,
            icon: formdata.icon as (typeof LAB_CATEGORY_ICON_NAMES)[number],
         });
         message.success('模板分类创建成功');
         navigateTo('/app/manage/tag?scope=lab-category');
         return;
      }
      await $trpc.admin.tag.add.mutate({
         name: formdata.name.trim(),
         scope: formdata.scope as 'problem' | 'lab',
         ...(isLabTag.value ? {} : { color: formdata.color }),
         ...(formdata.imageId ? { imageId: formdata.imageId } : {}),
         description: formdata.description,
      });
      message.success(isLabTag.value ? '技术栈标签创建成功' : '标签创建成功');
      navigateTo(isLabTag.value ? '/app/manage/tag?scope=lab' : '/app/publish');
   } catch (error) {
      console.error('创建标签失败', error);
      message.error(`${submitLabel.value.replace('创建', '')}创建失败`, (error as Error)?.message || '请稍后重试');
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
         class="w-full max-w-[44rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <h1
            class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
            创建标签
         </h1>
         <StForm
            ref="form"
            v-model:model-value="formdata"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem] max-md:gap-4!">
               <StFormItem name="scope" label="标签类型" required>
                  <StSlideRadioGroup
                     v-model:value="formdata.scope"
                     :options="scopeOptions" />
                  <p class="st-font-caption text-accent-400">{{ SCOPE_HINT[formdata.scope] }}</p>
               </StFormItem>
               <StFormItem
                  name="name"
                  :label="isCategory ? '分类名称' : '标签名'"
                  :error-message="isCategory ? '分类名称需为 1～12 个字符' : undefined"
                  required>
                  <StInput
                     v-model:value="formdata.name"
                     :maxlength="isCategory ? 12 : undefined"
                     :placeholder="
                        isCategory
                           ? '例如：移动端、游戏'
                           : isLabTag
                             ? '技术栈名称，例如：Vue、Tailwind CSS'
                             : '请输入标签名'
                     "
                     name="name"
                     :outer-class />
               </StFormItem>
               <StFormItem
                  v-if="!isLabTag"
                  name="color"
                  :label="isCategory ? '主题色' : '标签颜色'"
                  required>
                  <StColorPicker
                     v-model:value="formdata.color"
                     :outer-class />
               </StFormItem>

               <template v-if="isCategory">
                  <StFormItem name="icon" label="页签图标">
                     <div class="grid w-full grid-cols-9 gap-2 max-md:grid-cols-7">
                        <button
                           v-for="option in categoryIconOptions"
                           :key="option.value"
                           type="button"
                           :title="option.value"
                           :aria-label="option.value"
                           :aria-pressed="formdata.icon === option.value"
                           class="flex aspect-square items-center justify-center rounded-lg border transition-colors cursor-pointer"
                           :class="
                              formdata.icon === option.value
                                 ? 'border-primary bg-primary/15 text-white'
                                 : 'border-accent-500 text-accent-300 hover:border-accent-300 hover:text-white'
                           "
                           @click="formdata.icon = option.value">
                           <Component :is="option.icon" size="1.25rem" />
                        </button>
                     </div>
                  </StFormItem>
                  <StFormItem name="preview" label="预览">
                     <StSpace align="center" gap="1rem" wrap>
                        <StTagButton
                           :icon="labCategoryIcon(formdata.icon) as DefineComponent"
                           :tag="{ name: formdata.name.trim() || '分类名称', color: formdata.color }"
                           selected
                           contrast-text />
                        <StTag
                           size="small"
                           contrast-text
                           :color="formdata.color"
                           :content="formdata.name.trim() || '分类名称'" />
                     </StSpace>
                  </StFormItem>
               </template>
               <StFormItem
                  v-else
                  name="imageId"
                  :label="isLabTag ? '标签图标（可选）' : '标签图标'"
                  :required="isProblem">
                  <StUploadImage
                     v-model:image-id="formdata.imageId"
                     :icon="Tag"
                     placeholder="请选择标签图标" />
                  <p v-if="isLabTag" class="st-font-caption text-accent-400">
                     建议使用正方形透明背景图标；未上传时使用内置技术栈图标或通用标签图标。与内置标签同名时会覆盖内置标签的图标。
                  </p>
               </StFormItem>
               <StFormItem name="description" :label="isCategory ? '分类描述' : '标签描述'">
                  <StTextarea
                     v-model:value="formdata.description"
                     :maxlength="isCategory ? 100 : undefined"
                     :placeholder="isCategory ? '仅在管理页展示，最多 100 字' : '请输入标签描述'"
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
                     <span>{{ submitLabel }}</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
