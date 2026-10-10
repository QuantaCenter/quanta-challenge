<script setup lang="ts">
import {
   FileCollection,
   FileEditingOne,
   GoldMedalTwo,
   TableReport,
} from '@icon-park/vue-next';
import {
   canPublishCourse,
   useAllCourses,
   courseTopics,
   type LearningCourse,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useMessage } from '~/components/st/Message/use-message';
import ReferencedTopicsField from './ReferencedTopicsField.vue';

/**
 * 创建 / 编辑课程。
 *
 * 课程是**唯一需要审核**的实体：保存默认进「待审核」，审核通过才上架到学习侧。
 * 文章与专题保存即可见（见各自表单）。
 */
const props = withDefaults(
   defineProps<{
      mode?: 'create' | 'edit';
      courseId?: string | number;
   }>(),
   { mode: 'create', courseId: undefined },
);

useSeoMeta({
   title: computed(() =>
      props.mode === 'create'
         ? '创建课程 - Quanta Challenge'
         : '编辑课程 - Quanta Challenge',
   ),
});

const message = useMessage();
const { addCourse, editCourse } = useLearningContentStore();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const editing = computed(
   () => props.mode === 'edit' && props.courseId !== undefined,
);
const content = useLearningContentStore();
const allCourses = useAllCourses(content);
const course = computed<LearningCourse | undefined>(() =>
   editing.value
      ? allCourses.find((item) => item.id === Number(props.courseId))
      : undefined,
);

const form = reactive({
   name: '',
   slug: '',
   description: '',
   weight: 10,
   topicIds: [] as number[],
});

const prefill = () => {
   const source = course.value;
   if (!source) return;
   form.name = source.name;
   form.slug = source.slug;
   form.description = source.description;
   form.weight = source.weight;
   form.topicIds = courseTopics(source.id, content).map((topic) => topic.id);
};

watch(course, prefill, { immediate: true });

const canSubmit = computed(
   () => form.name.trim().length > 0 && form.topicIds.length > 0,
);

/** 发布校验（设计文档 §15）：0 专题的课程只能存草稿 */
const publishable = computed(() =>
   course.value
      ? form.topicIds.length > 0
      : canSubmit.value,
);

const router = useRouter();
const backAfterSubmit = () => goBackOr(router, '/app/publish/content');

const submitting = ref(false);

const save = async (status: LearningCourse['status']) => {
   if (submitting.value) return;
   if (status === 'published' && !publishable.value) {
      message.error('还不能上架', '课程至少要编排 1 个专题');
      return;
   }

   const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description,
      weight: Number(form.weight) || 10,
      topicIds: form.topicIds,
      status,
   };

   submitting.value = true;
   let saved;
   try {
      saved =
         editing.value && course.value
            ? await editCourse(course.value.id, payload)
            : await addCourse(payload);
   } catch (error) {
      message.error('保存失败', (error as Error).message);
      return;
   } finally {
      submitting.value = false;
   }

   if (!saved) {
      message.error('保存失败', '没有找到这门课程，可能已经被删掉了');
      return;
   }

   message.success(
      status === 'published' ? '课程已上架' : '课程已提交审核',
      status === 'published'
         ? `《${saved.name}》已出现在「全部课程」里`
         : `《${saved.name}》编排了 ${form.topicIds.length} 个专题，等待超管审核`,
   );
   backAfterSubmit();
};

const resetForm = () => {
   if (editing.value) {
      prefill();
      return;
   }
   form.name = '';
   form.slug = '';
   form.description = '';
   form.weight = 10;
   form.topicIds = [];
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StEmptyStatus
         v-if="editing && !course"
         content="没有这门课程"
         class="pt-[10rem]" />

      <StSpace
         v-else
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem" fill-x>
            <h1 class="st-font-hero-bold">
               {{ editing ? '编辑课程' : '创建课程' }}
            </h1>
            <StTag
               v-if="course"
               size="small"
               class="mb-2"
               :color="course.status === 'published' ? '#a6fb1d' : '#ffbe31'"
               :content="course.status === 'published' ? '已上架' : '待审核'" />
         </StSpace>

         <StForm v-model:model-value="form" class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <StFormItem name="name" label="课程名称" required>
                  <StInput
                     v-model:value="form.name"
                     placeholder="例如：CSS"
                     name="name"
                     :outer-class />
               </StFormItem>

               <StSpace gap="1.5rem" fill-x>
                  <StFormItem name="slug" label="英文标识">
                     <StInput v-model:value="form.slug" :outer-class />
                  </StFormItem>
                  <StFormItem name="weight" label="排序权重">
                     <StInput
                        v-model:value="form.weight"
                        type="number"
                        placeholder="10"
                        :outer-class />
                  </StFormItem>
               </StSpace>

               <StFormItem name="description" label="一句话描述" required>
                  <StTextarea
                     v-model:value="form.description"
                     rows="3"
                     placeholder="这门课讲什么，学完能做到什么"
                     :outer-class />
               </StFormItem>

               <StFormItem name="topics" label="编排专题" required>
                  <ReferencedTopicsField v-model:value="form.topicIds" />
               </StFormItem>
            </StSpace>

            <StSpace
               align="center"
               gap="0.75rem"
               fill-x
               class="mt-6 px-4 py-3 rounded-[0.5rem] bg-accent-600">
               <TableReport
                  class="text-accent-300 shrink-0"
                  size="1rem"
                  :strokeWidth="3" />
               <span class="st-font-tooltip text-accent-300 flex-1">
                  {{
                     form.topicIds.length
                        ? `已编排 ${form.topicIds.length} 个专题`
                        : '还没有编排专题'
                  }}
               </span>
               <NuxtLink
                  to="/app/publish/topic"
                  target="_blank"
                  class="shrink-0">
                  <StButton size="sm" bordered>
                     <StSpace align="center" gap="0.375rem">
                        <FileEditingOne size="1rem" />
                        <span>去创建新专题</span>
                     </StSpace>
                  </StButton>
               </NuxtLink>
            </StSpace>

            <NuxtLink
               to="/app/publish/content"
               target="_blank"
               class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1 px-2 mt-4">
               <FileCollection size="0.875rem" />
               内容库
            </NuxtLink>

            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem]">
               <div class="text-accent-300">
                  {{
                     canSubmit ? '' : '填好课程名称，并至少编排 1 个专题'
                  }}
               </div>
               <StSpace gap="1rem" align="center">
                  <StButton bordered @click="resetForm">
                     <span>{{ editing ? '还原' : '清空' }}</span>
                  </StButton>
                  <StButton
                     :disabled="!canSubmit || submitting"
                     bordered
                     @click="save('pending')">
                     <span>提交审核</span>
                  </StButton>
                  <StButton
                     :disabled="!publishable || submitting"
                     @click="save('published')">
                     <StSpace align="center" gap="0.375rem">
                        <GoldMedalTwo size="1rem" />
                        <span>直接上架</span>
                     </StSpace>
                  </StButton>
               </StSpace>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
