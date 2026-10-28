<script setup lang="ts">
import {
   ArrowDown,
   ArrowLeft,
   ArrowUp,
   Delete,
   Save,
   Send,
   TakeOff,
} from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

type TopicItem =
   | { type: 'article'; articleId: string; title?: string }
   | { type: 'problem'; baseId: number; title?: string | null };

const props = defineProps<{ topicId?: string }>();
const { $trpc } = useNuxtApp();
const message = useMessage();
const loading = ref(!!props.topicId);
const saving = ref(false);
const publishing = ref(false);
const status = ref<'DRAFT' | 'PUBLISHED'>('DRAFT');
const title = ref('');
const description = ref('');
const items = ref<TopicItem[]>([]);
const articles = ref<Array<{ id: string; title: string; status: string }>>([]);
const selectedArticleId = ref('');
const selectedProblem = ref<number[]>([]);
const articleOptions = computed(() =>
   articles.value.map((article) => ({
      value: article.id,
      label: article.title,
      description: article.status === 'PUBLISHED' ? '已发布' : '草稿',
   })),
);

useSeoMeta({
   title: () => `${props.topicId ? '编辑' : '创建'}学习专题 - Quanta Challenge`,
});

const load = async () => {
   loading.value = true;
   try {
      const [articleList, topic] = await Promise.all([
         $trpc.admin.learning.listArticles.query(),
         props.topicId
            ? $trpc.admin.learning.getTopic.query({ id: props.topicId })
            : Promise.resolve(null),
      ]);
      articles.value = articleList;
      if (topic) {
         title.value = topic.title;
         description.value = topic.description;
         status.value = topic.status;
         items.value = topic.items.map((item) =>
            item.type === 'article'
               ? {
                    type: 'article',
                    articleId: item.articleId,
                    title: item.title,
                 }
               : { type: 'problem', baseId: item.baseId, title: item.title },
         );
      }
   } catch (error) {
      message.error('专题加载失败', error instanceof Error ? error.message : String(error));
   } finally {
      loading.value = false;
   }
};

onMounted(load);

const addArticle = () => {
   const article = articles.value.find((item) => item.id === selectedArticleId.value);
   if (!article) return;
   if (items.value.some((item) => item.type === 'article' && item.articleId === article.id)) {
      message.error('该文章已在专题中');
      return;
   }
   items.value.push({ type: 'article', articleId: article.id, title: article.title });
   selectedArticleId.value = '';
};

const addProblem = (problem: { baseId: number; title: string }) => {
   const { baseId } = problem;
   if (items.value.some((item) => item.type === 'problem' && item.baseId === baseId)) {
      message.error('该题目已在专题中');
      return;
   }
   items.value.push({ type: 'problem', baseId, title: problem.title });
   selectedProblem.value = [];
};

const move = (index: number, offset: number) => {
   const target = index + offset;
   if (target < 0 || target >= items.value.length) return;
   const next = [...items.value];
   [next[index], next[target]] = [next[target]!, next[index]!];
   items.value = next;
};

const payload = () => ({
   title: title.value.trim(),
   description: description.value,
   items: items.value.map((item) =>
      item.type === 'article'
         ? { type: 'article' as const, articleId: item.articleId }
         : { type: 'problem' as const, baseId: item.baseId },
   ),
});

const save = async () => {
   if (!title.value.trim()) {
      message.error('请填写专题标题');
      return undefined;
   }
   saving.value = true;
   try {
      if (props.topicId) {
         const topic = await $trpc.admin.learning.updateTopic.mutate({
            id: props.topicId,
            ...payload(),
         });
         message.success('草稿已保存');
         return topic.id;
      }
      const topic = await $trpc.admin.learning.createTopic.mutate(payload());
      message.success('草稿已创建');
      await navigateTo(`/app/publish/topic/${topic.id}`, { replace: true });
      return topic.id;
   } catch (error) {
      message.error('保存失败', error instanceof Error ? error.message : String(error));
      return undefined;
   } finally {
      saving.value = false;
   }
};

const togglePublished = async () => {
   let id = props.topicId;
   if (!id) {
      id = await save();
      if (!id) return;
   } else if (!(await save())) {
      return;
   }
   publishing.value = true;
   try {
      if (status.value === 'PUBLISHED') {
         await $trpc.admin.learning.unpublishTopic.mutate({ id });
         status.value = 'DRAFT';
         message.success('专题已下架');
      } else {
         await $trpc.admin.learning.publishTopic.mutate({ id });
         status.value = 'PUBLISHED';
         message.success('专题已发布');
      }
   } catch (error) {
      message.error('状态更新失败', error instanceof Error ? error.message : String(error));
   } finally {
      publishing.value = false;
   }
};

</script>

<template>
   <StSpace fill direction="vertical" align="center" gap="0" class="overflow-auto">
      <StSpace fill-y direction="vertical" gap="0" class="mt-6 w-full max-w-[65rem] pb-24 max-md:px-4">
         <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
               <NuxtLink
                  to="/app/manage/learning"
                  class="flex size-9 items-center justify-center rounded-md text-accent-300 hover:bg-accent-600 hover:text-white">
                  <ArrowLeft />
               </NuxtLink>
               <div>
                  <h1 class="text-[2.5rem] font-bold text-white max-md:text-[1.5rem] max-md:leading-[1.2]">
                     {{ topicId ? '编辑学习专题' : '创建学习专题' }}
                  </h1>
                  <StTag
                     class="mt-2"
                     :content="status === 'PUBLISHED' ? '已发布' : '草稿'"
                     :color="status === 'PUBLISHED' ? '#25B38A' : '#575757'"
                     size="small" />
               </div>
            </div>
            <div class="flex gap-2">
               <StButton bordered :loading="saving" @click="save">
                  <Save class="mr-2" />保存草稿
               </StButton>
               <StButton
                  :theme="status === 'PUBLISHED' ? 'danger' : 'secondary'"
                  :loading="publishing"
                  @click="togglePublished">
                  <TakeOff v-if="status === 'PUBLISHED'" class="mr-2" />
                  <Send v-else class="mr-2" />
                  {{ status === 'PUBLISHED' ? '下架' : '发布' }}
               </StButton>
            </div>
         </div>

         <div v-if="loading" class="py-20 text-center text-accent-300">正在加载专题…</div>
         <div v-else class="flex flex-col gap-5">
            <StCard class="!h-auto gap-4">
               <label class="flex flex-col gap-2 text-sm text-accent-300">
                  标题
                  <StInput
                     v-model:value="title"
                     maxlength="200"
                     outer-class="bg-accent-700"
                     placeholder="专题标题" />
               </label>
               <label class="flex flex-col gap-2 text-sm text-accent-300">
                  描述
                  <StTextarea
                     v-model:value="description"
                     maxlength="2000"
                     rows="4"
                     outer-class="bg-accent-700"
                     class="w-full resize-y"
                     placeholder="专题介绍" />
               </label>
            </StCard>

            <StCard class="!h-auto">
               <h2 class="st-font-capture text-lg text-white">专题内容</h2>
               <p class="mt-1 text-sm text-accent-300">文章和题目会按下方顺序混排展示。</p>

               <div class="mt-4 grid gap-3 md:grid-cols-2">
                  <div class="flex gap-2">
                     <StSelect
                        v-model:value="selectedArticleId"
                        :options="articleOptions"
                        hide-icon
                        placeholder="选择文章"
                        outer-class="min-w-0 flex-1 bg-accent-700 !py-2.5 !px-4">
                        <template #selected-preview>
                           <span class="text-white">
                              {{ articles.find((item) => item.id === selectedArticleId)?.title }}
                           </span>
                        </template>
                     </StSelect>
                     <StButton size="sm" bordered @click="addArticle">添加文章</StButton>
                  </div>
                  <StProblemPicker
                     v-model:value="selectedProblem"
                     value-key="baseId"
                     :multiple="false"
                     :max="1"
                     placeholder="搜索并添加已发布题目"
                     @select="addProblem" />
               </div>

               <ol class="mt-4 flex flex-col gap-2">
                  <li
                     v-for="(item, index) in items"
                     :key="item.type === 'article' ? `a-${item.articleId}` : `p-${item.baseId}`"
                     class="flex items-center gap-3 rounded-lg border border-accent-500 bg-accent-700 p-3">
                     <span class="w-7 text-center text-sm text-accent-400">{{ index + 1 }}</span>
                     <span
                        class="rounded px-2 py-1 text-xs"
                        :class="
                           item.type === 'article'
                              ? 'bg-secondary/15 text-secondary'
                              : 'bg-primary/15 text-primary'
                        ">
                        {{ item.type === 'article' ? '文章' : '题目' }}
                     </span>
                     <span class="min-w-0 flex-1 truncate text-white">
                        {{
                           item.type === 'article'
                              ? item.title || item.articleId
                              : item.title || `题目 #${item.baseId}`
                        }}
                     </span>
                     <button
                        type="button"
                        aria-label="上移"
                        :disabled="index === 0"
                        class="text-accent-300 hover:text-white disabled:opacity-30"
                        @click="move(index, -1)">
                        <ArrowUp />
                     </button>
                     <button
                        type="button"
                        aria-label="下移"
                        :disabled="index === items.length - 1"
                        class="text-accent-300 hover:text-white disabled:opacity-30"
                        @click="move(index, 1)">
                        <ArrowDown />
                     </button>
                     <button
                        type="button"
                        aria-label="删除"
                        class="text-accent-300 hover:text-error"
                        @click="items.splice(index, 1)">
                        <Delete />
                     </button>
                  </li>
               </ol>
               <StEmptyStatus v-if="!items.length" content="暂无专题内容" class="!w-full py-10" />
            </StCard>
         </div>
      </StSpace>
   </StSpace>
</template>
