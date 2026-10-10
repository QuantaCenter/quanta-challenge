<script setup lang="ts">
import {
   FileCollection,
   FileEditingOne,
   TableReport,
} from '@icon-park/vue-next';
import {
   useAllCourses,
   useLearningTopic,
   useAllTopics,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useMessage } from '~/components/st/Message/use-message';
import ReferencedArticlesField from './ReferencedArticlesField.vue';

/**
 * 创建 / 编辑专题。
 *
 * 专题**引用**文章、被课程**集合**，这两处都是引用而不是归属，
 * 所以编辑一篇已有专题时改的是「引用了哪些文章」，不会动文章本身。
 * 专题不需要审核：保存即生效。
 */
const props = withDefaults(
   defineProps<{
      mode?: 'create' | 'edit';
      topicId?: string | number;
   }>(),
   { mode: 'create', topicId: undefined },
);

useSeoMeta({
   title: computed(() =>
      props.mode === 'create'
         ? '创建专题 - Quanta Challenge'
         : '编辑专题 - Quanta Challenge',
   ),
});

const message = useMessage();
const { addTopic, editTopic } = useLearningContentStore();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

// 创作侧要能看到待审 / 草稿课程，否则新专题没法归到它们下面
const courses = useAllCourses();
const courseOptions = computed(() =>
   courses.map((course) => ({ label: course.name, value: course.id })),
);

const content = useLearningContentStore();
const editing = computed(
   () => props.mode === 'edit' && props.topicId !== undefined,
);
const topic = computed(() =>
   editing.value ? useLearningTopic(props.topicId!, content) : undefined,
);

const form = reactive({
   courseId: 0,
   name: '',
   slug: '',
   description: '',
   weight: 10,
   prerequisites: [] as number[],
   articleIds: [] as number[],
});

// 编辑已有专题时用它的内容覆盖表单；新建时保留初始值
const prefill = () => {
   const source = topic.value;
   if (!source) return;
   form.courseId = source.courseId;
   form.name = source.name;
   form.slug = source.slug;
   form.description = source.description;
   form.weight = source.weight;
   form.prerequisites = [...source.prerequisites];
   form.articleIds = [...source.articleIds];
};

watch(topic, prefill, { immediate: true });

// 新建时默认归到第一门课程
watchEffect(() => {
   if (!editing.value && form.courseId === 0 && courses.length > 0) {
      form.courseId = courses[0]!.id;
   }
});

const existingTopics = computed(() =>
   useAllTopics(content).filter((item) => item.id !== topic.value?.id),
);

const togglePrerequisite = (id: number) => {
   const idx = form.prerequisites.indexOf(id);
   if (idx === -1) form.prerequisites.push(id);
   else form.prerequisites.splice(idx, 1);
};

const canSubmit = computed(
   () =>
      form.courseId > 0 &&
      form.name.trim().length > 0 &&
      form.articleIds.length > 0,
);

const router = useRouter();
// 提交后回上一页；上一页读的是同一份内容状态，内容一变它自然就是新的
const backAfterSubmit = () => goBackOr(router, '/app/publish/content');

const submitting = ref(false);

const submit = async () => {
   if (!canSubmit.value || submitting.value) return;

   const payload = {
      courseId: form.courseId,
      name: form.name,
      slug: form.slug,
      description: form.description,
      weight: Number(form.weight) || 10,
      prerequisites: form.prerequisites,
      articleIds: form.articleIds,
   };

   submitting.value = true;
   let saved;
   try {
      saved =
         editing.value && topic.value
            ? await editTopic(topic.value.id, payload)
            : await addTopic(payload);
   } catch (error) {
      message.error('保存失败', (error as Error).message);
      return;
   } finally {
      submitting.value = false;
   }

   if (!saved) {
      message.error('保存失败', '没有找到这个专题，可能已经被删掉了');
      return;
   }

   const course = courses.find((item) => item.id === saved.courseId);
   message.success(
      editing.value ? '专题已更新' : '专题已创建',
      `《${saved.name}》引用 ${saved.articleIds.length} 篇文章，归到课程「${course?.name ?? saved.courseId}」下`,
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
   form.prerequisites = [];
   form.articleIds = [];
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StEmptyStatus
         v-if="editing && !topic"
         content="没有这个专题"
         class="pt-[10rem]" />

      <StSpace
         v-else
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">
            {{ editing ? '编辑专题' : '创建专题' }}
         </h1>

         <StForm v-model:model-value="form" class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <StFormItem name="courseId" label="归属课程" required>
                  <StSelect
                     v-model:value="form.courseId"
                     :options="courseOptions"
                     placeholder="选择一个课程"
                     attach-to-body
                     :outer-class />
               </StFormItem>

               <StFormItem name="name" label="专题名称" required>
                  <StInput
                     v-model:value="form.name"
                     placeholder="例如：布局"
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

               <StFormItem name="description" label="一句话描述">
                  <StTextarea
                     v-model:value="form.description"
                     rows="3"
                     placeholder="这个专题讲什么，适合什么阶段的人看"
                     :outer-class />
               </StFormItem>

               <StFormItem name="prerequisites" label="前置专题">
                  <div class="flex flex-wrap gap-3">
                     <StTagButton
                        v-for="item in existingTopics"
                        :key="item.id"
                        :selected="form.prerequisites.includes(item.id)"
                        :tag="{ name: item.name }"
                        @click="togglePrerequisite(item.id)" />
                     <span
                        v-if="existingTopics.length === 0"
                        class="st-font-tooltip text-accent-400">
                        还没有别的专题
                     </span>
                  </div>
               </StFormItem>

               <StFormItem name="articles" label="引用文章" required>
                  <ReferencedArticlesField v-model:value="form.articleIds" />
               </StFormItem>

               <StSpace
                  align="center"
                  gap="0.75rem"
                  fill-x
                  class="px-4 py-3 rounded-[0.5rem] bg-accent-600">
                  <TableReport
                     class="text-accent-300 shrink-0"
                     size="1rem"
                     :strokeWidth="3" />
                  <span class="st-font-tooltip text-accent-300 flex-1">
                     {{
                        form.articleIds.length
                           ? `已引用 ${form.articleIds.length} 篇文章`
                           : '还没有引用文章'
                     }}
                  </span>
                  <NuxtLink
                     to="/app/publish/article/new"
                     target="_blank"
                     class="shrink-0">
                     <StButton size="sm" bordered>
                        <StSpace align="center" gap="0.375rem">
                           <FileEditingOne size="1rem" />
                           <span>去写新文章</span>
                        </StSpace>
                     </StButton>
                  </NuxtLink>
               </StSpace>
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
                     canSubmit ? '' : '填好专题名称，并至少引用 1 篇文章'
                  }}
               </div>
               <StSpace gap="1rem" align="center">
                  <StButton v-if="!editing" bordered @click="resetForm">
                     <span>清空</span>
                  </StButton>
                  <StButton v-else bordered @click="resetForm">
                     <span>还原</span>
                  </StButton>
                  <StButton :disabled="!canSubmit || submitting" @click="submit">
                     <span>{{ editing ? '保存修改' : '创建专题' }}</span>
                  </StButton>
               </StSpace>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
