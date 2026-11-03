<script setup lang="ts">
import { SaveOne } from '@icon-park/vue-next';
import type { StForm } from '#components';
import type { IRule } from '~/components/st/Form/type';
import { useMessage } from '~/components/st/Message/use-message';
import MarkdownEditingDrawer from '../../_drawers/MarkdownEditingDrawer.vue';
import type { AdminCourseChapter } from '~/types/course-admin';

const props = defineProps<{
   courseId: string;
   /** 传入即为编辑模式，否则新建 */
   chapter?: AdminCourseChapter | null;
}>();

const opened = defineModel<boolean>('opened', { default: false });
const emits = defineEmits<{ saved: [text: string] }>();

const { $trpc } = useNuxtApp();
const message = useMessage();
const isEditing = computed(() => !!props.chapter);

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const formdata = reactive({ title: '', introduction: '' });
const rules: IRule[] = [
   {
      field: 'title',
      required: true,
      validator: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 50,
   },
];

/** 每次打开都换 key，让表单连同校验状态与 Markdown 编辑器一起重建 */
const formKey = ref(0);
const form = useTemplateRef<InstanceType<typeof StForm>>('form');

watch(opened, (value) => {
   if (!value) return;
   formdata.title = props.chapter?.title ?? '';
   formdata.introduction = props.chapter?.introduction ?? '';
   markdownMounted.value = false;
   formKey.value += 1;
});

const markdownMounted = ref(false);
const markdownOpened = ref(false);
const openMarkdownEditor = async () => {
   markdownMounted.value = true;
   await nextTick();
   markdownOpened.value = true;
};

const submitting = ref(false);
const handleSubmit = async () => {
   if (!form.value?.validate().success) {
      message.error('表单填写有误', '请填写 1～50 字的章节标题');
      return;
   }
   submitting.value = true;
   try {
      if (props.chapter) {
         await $trpc.admin.course.updateChapter.mutate({ id: props.chapter.id, ...formdata });
      } else {
         await $trpc.admin.course.createChapter.mutate({ courseId: props.courseId, ...formdata });
      }
      opened.value = false;
      emits('saved', isEditing.value ? '章节已更新' : '章节已添加');
   } catch (err) {
      message.error(isEditing.value ? '章节更新失败' : '章节添加失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      submitting.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6 max-md:p-5">
            <StSpace direction="vertical" gap="0.25rem">
               <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">
                  {{ isEditing ? '编辑章节' : '添加章节' }}
               </h1>
               <p class="st-font-caption text-accent-400">
                  {{ isEditing ? '修改会立即对课程生效' : '新章节会自带第一个学习阶段，添加后即可往里放小节' }}
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
                     <StFormItem name="title" label="章节标题" required>
                        <template #header-right>
                           <span class="st-font-caption text-accent-400">
                              {{ formdata.title.length }} / 50
                           </span>
                        </template>
                        <StInput
                           v-model:value="formdata.title"
                           placeholder="例如：响应式基础"
                           maxlength="50"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="introduction" label="章节导读">
                        <template #header-right>
                           <StTextButton text="使用 md 编辑器" @click="openMarkdownEditor" />
                        </template>
                        <StTextarea
                           v-model:value="formdata.introduction"
                           rows="8"
                           placeholder="进入章节时展示，介绍本章目标与学习建议（支持 Markdown，不计入学习进度）"
                           :outer-class />
                     </StFormItem>
                  </StSpace>
               </StForm>
            </StSpace>
         </StSpace>
         <StSpace justify="end" gap="0.75rem" class="p-4 pt-0 w-full">
            <StButton
               bordered
               theme="secondary"
               class="py-[0.375rem] px-[1.25rem] !rounded-[0.375rem]"
               @click="opened = false">
               取消
            </StButton>
            <StButton
               :loading="submitting"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
               @click="handleSubmit">
               <div class="flex gap-2 items-center">
                  <SaveOne class="text-[1.25rem]" />
                  <span>{{ isEditing ? '保存' : '添加' }}</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>

   <!-- 与章节抽屉同级挂载，保证层级在其之上 -->
   <MarkdownEditingDrawer
      v-if="markdownMounted"
      :key="formKey"
      v-model:opened="markdownOpened"
      v-model:markdown="formdata.introduction"
      playground
      drawer-title="编辑章节导读" />
</template>
