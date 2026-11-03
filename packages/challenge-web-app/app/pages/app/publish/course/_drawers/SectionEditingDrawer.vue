<script setup lang="ts">
import { Info, SaveOne } from '@icon-park/vue-next';
import type { StForm } from '#components';
import type { IRule } from '~/components/st/Form/type';
import { useMessage } from '~/components/st/Message/use-message';
import MarkdownEditingDrawer from '../../_drawers/MarkdownEditingDrawer.vue';
import type { AdminCourseSection } from '~/types/course-admin';

type SectionType = 'article' | 'problem';

const props = defineProps<{
   /** 新建时归属的阶段 */
   stageId: string;
   /** 位置描述，如「第 1 章 · 阶段 2」 */
   location: string;
   /** 传入即为编辑模式 */
   section?: AdminCourseSection | null;
}>();

const opened = defineModel<boolean>('opened', { default: false });
const emits = defineEmits<{ saved: [text: string] }>();

const { $trpc } = useNuxtApp();
const message = useMessage();
const isEditing = computed(() => !!props.section);

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const typeOptions = [
   { label: '图文', value: 'article', color: '#FA7C0E' },
   { label: '实践题', value: 'problem', color: '#4CA7FF' },
];

const formdata = reactive({
   title: '',
   type: 'article' as SectionType,
   articleContent: '',
   problemPids: [] as number[],
});

const rules: IRule[] = [
   {
      field: 'title',
      required: true,
      validator: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 60,
   },
   {
      field: 'problemPids',
      validator: (value, data) => data.type !== 'problem' || (Array.isArray(value) && value.length > 0),
   },
];

const problemPresets = computed(() => {
   const problem = props.section?.baseProblem?.CurrentProblem;
   return problem ? [{ pid: problem.pid, title: problem.title, difficulty: problem.difficulty }] : [];
});

const completedCount = computed(() => props.section?._count.progress ?? 0);

/** 每次打开都换 key，让表单、题目选择器与 Markdown 编辑器一起按新数据重建 */
const formKey = ref(0);
const form = useTemplateRef<InstanceType<typeof StForm>>('form');
const markdownMounted = ref(false);
const markdownOpened = ref(false);

watch(opened, (value) => {
   if (!value) return;
   const section = props.section;
   formdata.title = section?.title ?? '';
   formdata.type = section?.type ?? 'article';
   formdata.articleContent = section?.articleContent ?? '';
   const pid = section?.baseProblem?.CurrentProblem?.pid;
   formdata.problemPids = pid ? [pid] : [];
   markdownMounted.value = false;
   formKey.value += 1;
});

const openMarkdownEditor = async () => {
   markdownMounted.value = true;
   await nextTick();
   markdownOpened.value = true;
};

const wordCount = computed(() => formdata.articleContent.replace(/\s/g, '').length);

const submitting = ref(false);
const handleSubmit = async () => {
   const { success, invalidField } = form.value?.validate() ?? { success: false, invalidField: null };
   if (!success) {
      message.error(
         '表单填写有误',
         invalidField === 'problemPids' ? '实践题小节需要关联一道题目' : '请填写 1～60 字的小节标题',
      );
      return;
   }
   const payload = {
      title: formdata.title,
      type: formdata.type,
      articleContent: formdata.type === 'article' ? formdata.articleContent : '',
      problemPid: formdata.type === 'problem' ? (formdata.problemPids[0] ?? null) : null,
   };
   submitting.value = true;
   try {
      if (props.section) {
         await $trpc.admin.course.updateSection.mutate({ id: props.section.id, ...payload });
      } else {
         await $trpc.admin.course.createSection.mutate({ stageId: props.stageId, ...payload });
      }
      opened.value = false;
      emits('saved', isEditing.value ? '小节已更新' : '小节已添加');
   } catch (err) {
      message.error(isEditing.value ? '小节更新失败' : '小节添加失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      submitting.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="40rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6 max-md:p-5">
            <StSpace direction="vertical" gap="0.25rem">
               <span class="st-font-caption text-accent-400">{{ location }}</span>
               <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">
                  {{ isEditing ? '编辑小节' : '添加小节' }}
               </h1>
            </StSpace>
            <StSpace fill class="relative overflow-auto">
               <StForm
                  :key="formKey"
                  ref="form"
                  v-model:model-value="formdata"
                  :rules="rules"
                  class="w-full absolute top-0 left-0">
                  <StSpace direction="vertical" gap="1.5rem" fill-x class="pb-4">
                     <div
                        v-if="completedCount"
                        class="flex w-full items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 st-font-caption text-warning">
                        <Info class="mt-0.5 shrink-0" />
                        <span>已有 {{ completedCount }} 名学员完成本节，修改内容不会重置他们的完成状态。</span>
                     </div>

                     <StFormItem name="title" label="小节标题" required>
                        <template #header-right>
                           <span class="st-font-caption text-accent-400">
                              {{ formdata.title.length }} / 60
                           </span>
                        </template>
                        <StInput
                           v-model:value="formdata.title"
                           placeholder="例如：认识 ref 与 reactive"
                           maxlength="60"
                           :outer-class />
                     </StFormItem>

                     <StFormItem name="type" label="小节类型" required>
                        <StSlideRadioGroup v-model:value="formdata.type" :options="typeOptions" />
                     </StFormItem>

                     <StFormItem v-if="formdata.type === 'article'" name="articleContent" label="正文">
                        <template #header-right>
                           <StSpace align="center" gap="1rem">
                              <span class="st-font-caption text-accent-400">{{ wordCount }} 字</span>
                              <StTextButton text="使用 md 编辑器" @click="openMarkdownEditor" />
                           </StSpace>
                        </template>
                        <StTextarea
                           v-model:value="formdata.articleContent"
                           rows="12"
                           placeholder="支持 Markdown，学员阅读后点击「完成」即记为已学"
                           :outer-class />
                     </StFormItem>

                     <StFormItem v-else name="problemPids" label="关联题目" required>
                        <StProblemPicker
                           v-model:value="formdata.problemPids"
                           :multiple="false"
                           :max="1"
                           :presets="problemPresets"
                           placeholder="输入题目标题搜索已发布的题目"
                           :outer-class />
                        <p class="st-font-caption text-accent-400 px-1">
                           学员在该小节解锁后提交并通过判题，即自动完成本节。
                        </p>
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

   <!-- 与小节抽屉同级挂载，保证层级在其之上 -->
   <MarkdownEditingDrawer
      v-if="markdownMounted"
      :key="formKey"
      v-model:opened="markdownOpened"
      v-model:markdown="formdata.articleContent"
      width="70vw"
      drawer-title="编辑小节正文" />
</template>
