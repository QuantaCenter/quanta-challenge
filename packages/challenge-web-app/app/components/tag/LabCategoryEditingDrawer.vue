<script setup lang="ts">
import type { DefineComponent } from 'vue';
import { Box } from '@icon-park/vue-next';
import { LAB_CATEGORY_ICON_NAMES } from '@challenge/shared/lab-templates';
import { useMessage } from '~/components/st/Message/use-message';
import { labCategoryIcon } from '~/utils/lab-category-icons';

/** 模板分类的新建 / 编辑抽屉：名称、颜色、页签图标与描述 */

export interface ILabCategoryEditingTarget {
   id: string;
   name: string;
   description?: string | null;
   color: string;
   icon?: string | null;
   builtin?: boolean;
}

const props = defineProps<{
   /** 传入分类即为编辑模式，不传则为新建模式 */
   category?: ILabCategoryEditingTarget | null;
}>();

const opened = defineModel<boolean>('opened', { default: false });
const emits = defineEmits<{ saved: [id: string] }>();

const { $trpc } = useNuxtApp();
const message = useMessage();

const isEditing = computed(() => !!props.category);
const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const formdata = reactive({
   name: '',
   description: '',
   color: '#38BDF8',
   icon: 'components' as string,
});

watch(opened, (isOpened) => {
   if (!isOpened) return;
   formdata.name = props.category?.name ?? '';
   formdata.description = props.category?.description ?? '';
   formdata.color = props.category?.color ?? '#38BDF8';
   formdata.icon = props.category?.icon ?? 'components';
});

const iconOptions = LAB_CATEGORY_ICON_NAMES.map((name) => ({
   label: name,
   value: name,
   icon: labCategoryIcon(name),
}));

const nameError = computed(() => {
   const name = formdata.name.trim();
   if (!name) return '请输入分类名称';
   if (name.length > 12) return '分类名称最多 12 个字符';
   return '';
});

const saving = ref(false);
const submit = async () => {
   if (saving.value || nameError.value) return;
   const payload = {
      name: formdata.name.trim(),
      description: formdata.description.trim(),
      color: formdata.color,
      icon: (formdata.icon || null) as (typeof LAB_CATEGORY_ICON_NAMES)[number] | null,
   };
   saving.value = true;
   try {
      let id = props.category?.id;
      if (id) {
         await $trpc.admin.labCategory.update.mutate({ id, ...payload });
      } else {
         id = (await $trpc.admin.labCategory.create.mutate(payload)).id;
      }
      emits('saved', id);
      opened.value = false;
   } catch (error) {
      message.error(
         isEditing.value ? '分类更新失败' : '分类创建失败',
         (error as Error)?.message || '请稍后重试',
      );
   } finally {
      saving.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6 overflow-auto">
            <StSpace direction="vertical" gap="0.5rem">
               <h1 class="st-font-secondary-bold">
                  {{ isEditing ? '编辑模板分类' : '新建模板分类' }}
               </h1>
               <p class="st-font-caption text-accent-300">
                  模板分类显示为实验室页的分类筛选页签与模板卡片右上角的分类标签。
               </p>
            </StSpace>
            <StSpace direction="vertical" gap="1.5rem" fill-x>
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
               <StFormItem name="name" label="分类名称" required>
                  <StInput
                     v-model:value="formdata.name"
                     maxlength="12"
                     placeholder="例如：移动端、游戏"
                     :status="formdata.name && nameError ? 'error' : undefined"
                     :outer-class />
               </StFormItem>
               <StFormItem name="color" label="主题色" required>
                  <StColorPicker v-model:value="formdata.color" :outer-class />
               </StFormItem>
               <StFormItem name="icon" label="页签图标">
                  <div class="grid grid-cols-9 gap-2 max-md:grid-cols-7">
                     <button
                        v-for="option in iconOptions"
                        :key="option.value"
                        type="button"
                        :title="option.label"
                        :aria-label="option.label"
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
               <StFormItem name="description" label="分类描述">
                  <StTextarea
                     v-model:value="formdata.description"
                     maxlength="100"
                     placeholder="仅在管理页展示，最多 100 字"
                     :outer-class />
               </StFormItem>
            </StSpace>
         </StSpace>
         <StSpace justify="end" gap="0.75rem" class="w-full border-t border-accent-600 p-4">
            <StButton bordered @click="opened = false">取消</StButton>
            <StButton :loading="saving" :disabled="!!nameError" @click="submit">
               <div class="flex gap-2 items-center">
                  <Box class="text-[1.25rem]" />
                  <span>{{ isEditing ? '保存' : '创建' }}</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
