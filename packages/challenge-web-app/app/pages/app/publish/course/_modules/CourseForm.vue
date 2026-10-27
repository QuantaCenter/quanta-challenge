<script setup lang="ts">
import { GoldMedalTwo } from '@icon-park/vue-next';
import {
   useAllCourses,
   courseTopics,
   useAllTopics,
   type CourseInput,
   type LearningCourse,
   type LearningTopic,
   type TopicInput,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useMessage } from '~/components/st/Message/use-message';
import ReferencedTopicsField from './ReferencedTopicsField.vue';
import TopicEditingDrawer, {
   type TopicEditingDraft,
   type PendingTopic,
} from './TopicEditingDrawer.vue';

/** 创建 / 编辑课程，专题也在这里创建编辑（课程未保存前专题先作本地草稿） */
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

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const editing = computed(
   () => props.mode === 'edit' && props.courseId !== undefined,
);
const content = useLearningContentStore();
const allCourses = useAllCourses(content);
const allTopics = useAllTopics(content);

/* ----- 课程 / 专题写请求：服务端 cuid 与前端数字 id 的转换在这里完成 ----- */

/** 把数字 id 翻回服务端 cuid */
const articleCuids = (ids: number[]): string[] => {
   const byId = new Map(
      content.articles.value.map((item) => [item.id, item.cuid]),
   );
   return ids
      .map((id) => byId.get(id))
      .filter((cuid): cuid is string => Boolean(cuid));
};

const topicCuids = (ids: number[]): string[] => {
   const byId = new Map(content.topics.value.map((item) => [item.id, item.cuid]));
   return ids
      .map((id) => byId.get(id))
      .filter((cuid): cuid is string => Boolean(cuid));
};

const addCourse = async (input: CourseInput): Promise<LearningCourse> => {
   const { $trpc } = useNuxtApp();
   const created = (await $trpc.admin.learning.createCourse.mutate({
      name: input.name,
      description: input.description,
      coverPreset: input.coverPreset ?? 'slate',
      topicIds: topicCuids(input.topicIds),
   })) as { id: string };
   const state = await content.refresh();
   const course = state?.courses.find((item) => item.cuid === created.id);
   if (!course) throw new Error('课程已创建但读取失败');
   return course;
};

const editCourse = async (
   id: number,
   input: CourseInput,
): Promise<LearningCourse | undefined> => {
   const current = content.courses.value.find((item) => item.id === id);
   if (!current?.cuid) return undefined;
   const { $trpc } = useNuxtApp();
   await $trpc.admin.learning.updateCourse.mutate({
      id: current.cuid,
      name: input.name,
      description: input.description,
      coverPreset: input.coverPreset ?? 'slate',
      topicIds: topicCuids(input.topicIds),
   });
   const state = await content.refresh();
   return state?.courses.find((item) => item.id === id);
};

const addTopic = async (input: TopicInput): Promise<LearningTopic> => {
   const course = content.courses.value.find(
      (item) => item.id === input.courseId,
   );
   if (!course?.cuid) throw new Error('归属课程没有对应的服务端 id');
   const { $trpc } = useNuxtApp();
   const created = (await $trpc.admin.learning.createTopic.mutate({
      courseId: course.cuid,
      name: input.name,
      description: input.description,
      coverPreset: input.coverPreset ?? 'slate',
      articleIds: articleCuids(input.articleIds),
   })) as { id: string };
   const state = await content.refresh();
   const topic = state?.topics.find((item) => item.cuid === created.id);
   if (!topic) throw new Error('专题已创建但读取失败');
   return topic;
};

const editTopic = async (
   id: number,
   input: TopicInput,
): Promise<LearningTopic | undefined> => {
   const current = content.topics.value.find((item) => item.id === id);
   if (!current?.cuid) return undefined;
   const course = content.courses.value.find(
      (item) => item.id === input.courseId,
   );
   if (!course?.cuid) throw new Error('归属课程没有对应的服务端 id');
   const { $trpc } = useNuxtApp();
   await $trpc.admin.learning.updateTopic.mutate({
      id: current.cuid,
      courseId: course.cuid,
      name: input.name,
      description: input.description,
      coverPreset: input.coverPreset ?? 'slate',
      articleIds: articleCuids(input.articleIds),
   });
   const state = await content.refresh();
   return state?.topics.find((item) => item.id === id);
};
const course = computed<LearningCourse | undefined>(() =>
   editing.value
      ? allCourses.find((item) => item.id === Number(props.courseId))
      : undefined,
);

const form = reactive({
   name: '',
   description: '',
   topicIds: [] as number[],
});

/** 课程还没保存时新建的专题，随课程一起落库 */
const pendingTopics = ref<PendingTopic[]>([]);

const prefill = () => {
   const source = course.value;
   if (!source) return;
   form.name = source.name;
   form.description = source.description;
   form.topicIds = courseTopics(source.id, content).map((topic) => topic.id);
};

// 只在课程首次载入时回填
let prefilledCourseId: string | number | undefined;
watchEffect(() => {
   if (editing.value && course.value && prefilledCourseId !== props.courseId) {
      prefilledCourseId = props.courseId;
      prefill();
   }
});

const topicCount = computed(
   () => form.topicIds.length + pendingTopics.value.length,
);

const canSubmit = computed(
   () => form.name.trim().length > 0 && topicCount.value > 0,
);

const router = useRouter();
const backAfterSubmit = () => goBackOr(router, '/app/manage/content');

const submitting = ref(false);

const save = async (status: LearningCourse['status']) => {
   if (submitting.value) return;
   if (status === 'published' && !canSubmit.value) {
      message.error('还不能上架', '课程至少要编排 1 个专题');
      return;
   }

   const payload = {
      name: form.name,
      description: form.description,
      topicIds: form.topicIds,
      status,
   };
   const totalTopics = topicCount.value;

   submitting.value = true;
   let saved: LearningCourse | undefined;
   try {
      if (editing.value && course.value) {
         saved = await editCourse(course.value.id, payload);
      } else {
         saved = await addCourse(payload);
         // 随课程一起创建的专题先落库，再回填进课程的编排列表
         const createdIds: number[] = [];
         for (const draft of pendingTopics.value) {
            const topic = await addTopic({ ...draft, courseId: saved.id });
            createdIds.push(topic.id);
         }
         if (createdIds.length) {
            saved = await editCourse(saved.id, {
               ...payload,
               topicIds: [...form.topicIds, ...createdIds],
            });
         }
         pendingTopics.value = [];
      }
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
         : `《${saved.name}》编排了 ${totalTopics} 个专题，等待超管审核`,
   );
   backAfterSubmit();
};

const resetForm = () => {
   if (editing.value) {
      prefill();
      return;
   }
   form.name = '';
   form.description = '';
   form.topicIds = [];
   pendingTopics.value = [];
};

/* ----- 专题抽屉 ----- */

const drawerOpened = ref(false);
const drawerSaving = ref(false);
const drawerTarget = ref<
   { kind: 'existing'; id: number } | { kind: 'pending'; index: number } | null
>(null);

let pendingKey = 0;

const drawerDraft = computed<TopicEditingDraft | null>(() => {
   const target = drawerTarget.value;
   if (!target) return null;
   if (target.kind === 'pending')
      return pendingTopics.value[target.index] ?? null;
   const topic = allTopics.find((item) => item.id === target.id);
   if (!topic) return null;
   return {
      name: topic.name,
      description: topic.description,
      articleIds: [...topic.articleIds],
   };
});

const onDrawerConfirm = async (draft: TopicEditingDraft) => {
   const target = drawerTarget.value;

   // 待创建草稿：只改本地，随课程一起保存
   if (target?.kind === 'pending') {
      const current = pendingTopics.value[target.index];
      if (current) {
         pendingTopics.value[target.index] = { ...draft, key: current.key };
      }
      drawerOpened.value = false;
      return;
   }

   // 编辑已有专题：立即落库，归属改为当前课程
   if (target?.kind === 'existing') {
      if (!course.value) return;
      drawerSaving.value = true;
      try {
         await editTopic(target.id, { ...draft, courseId: course.value.id });
      } catch (error) {
         message.error('保存失败', (error as Error).message);
         return;
      } finally {
         drawerSaving.value = false;
      }
      drawerOpened.value = false;
      return;
   }

   // 新建专题：课程已存在就立即落库并挂到课程上
   if (course.value) {
      drawerSaving.value = true;
      let savedTopic;
      try {
         savedTopic = await addTopic({ ...draft, courseId: course.value.id });
      } catch (error) {
         message.error('创建专题失败', (error as Error).message);
         return;
      } finally {
         drawerSaving.value = false;
      }
      form.topicIds.push(savedTopic.id);
      drawerOpened.value = false;
      return;
   }

   // 课程还没保存：先记成本地草稿
   pendingTopics.value.push({ ...draft, key: `pending-${pendingKey++}` });
   drawerOpened.value = false;
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
         class="w-[44.8rem] pb-[10rem] my-6">
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

               <StFormItem name="description" label="一句话描述" required>
                  <StTextarea
                     v-model:value="form.description"
                     rows="3"
                     placeholder="这门课讲什么，学完能做到什么"
                     :outer-class />
               </StFormItem>

               <StFormItem name="topics" label="编排专题" required>
                  <ReferencedTopicsField
                     v-model:value="form.topicIds"
                     v-model:pending="pendingTopics"
                     @create="drawerTarget = null; drawerOpened = true"
                     @edit-existing="
                        (id) => {
                           drawerTarget = { kind: 'existing', id };
                           drawerOpened = true;
                        }
                     "
                     @edit-pending="
                        (index) => {
                           drawerTarget = { kind: 'pending', index };
                           drawerOpened = true;
                        }
                     " />
               </StFormItem>
            </StSpace>

            <StSpace justify="end" align="center" gap="1rem" class="px-2 mt-[2.13rem]">
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
                  :disabled="!canSubmit || submitting"
                  @click="save('published')">
                  <StSpace align="center" gap="0.375rem">
                     <GoldMedalTwo size="1rem" />
                     <span>直接上架</span>
                  </StSpace>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>

      <TopicEditingDrawer
         v-model:opened="drawerOpened"
         :topic="drawerDraft"
         :saving="drawerSaving"
         @confirm="onDrawerConfirm" />
   </StSpace>
</template>
