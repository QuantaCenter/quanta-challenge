<script setup lang="ts">
import { ArrowLeft, Save, Send, TakeOff } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import LearningPlaygroundEditor, {
   type LearningPlaygroundDraft,
} from './LearningPlaygroundEditor.vue';

const props = defineProps<{ articleId?: string }>();

const { $trpc } = useNuxtApp();
const message = useMessage();
const loading = ref(!!props.articleId);
const saving = ref(false);
const publishing = ref(false);
const status = ref<'DRAFT' | 'PUBLISHED'>('DRAFT');
const title = ref('');
const summary = ref('');
const source = ref('');
const coverImageId = ref('');
const coverImageUrl = ref('');
const playgrounds = ref<LearningPlaygroundDraft[]>([]);
const selectedProblem = ref<number[]>([]);

useSeoMeta({
   title: () => `${props.articleId ? '编辑' : '创建'}学习文章 - Quanta Challenge`,
});

const load = async () => {
   if (!props.articleId) return;
   loading.value = true;
   try {
      const article = await $trpc.admin.learning.getArticle.query({
         id: props.articleId,
      });
      title.value = article.title;
      summary.value = article.summary;
      source.value = article.source;
      coverImageId.value = article.coverImageId ?? '';
      playgrounds.value = article.playgrounds.map((item) => ({ ...item }));
      status.value = article.status;
   } catch (error) {
      message.error('文章加载失败', error instanceof Error ? error.message : String(error));
   } finally {
      loading.value = false;
   }
};

onMounted(load);

const appendDirective = (directive: string) => {
   source.value = `${source.value}${source.value && !source.value.endsWith('\n') ? '\n' : ''}${directive}\n`;
};

const insertPlayground = (id: string) => {
   appendDirective(`<Playground id="${id}" />`);
};

const removePlaygroundDirective = (id: string) => {
   const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   source.value = source.value.replace(
      new RegExp(`^\\s*<Playground\\s+id=["']${escapedId}["']\\s*/>\\s*\\n?`, 'gm'),
      '',
   );
};

const insertProblem = (problem: { baseId: number }) => {
   appendDirective(`<Problem baseId={${problem.baseId}} />`);
   selectedProblem.value = [];
};

const payload = () => ({
   title: title.value.trim(),
   summary: summary.value,
   source: source.value,
   coverImageId: coverImageId.value || null,
   playgrounds: playgrounds.value,
});

const save = async () => {
   if (!title.value.trim()) {
      message.error('请填写文章标题');
      return undefined;
   }
   saving.value = true;
   try {
      if (props.articleId) {
         const article = await $trpc.admin.learning.updateArticle.mutate({
            id: props.articleId,
            ...payload(),
         });
         playgrounds.value = article.playgrounds.map((item) => ({ ...item }));
         message.success('草稿已保存');
         return article.id;
      }
      const article = await $trpc.admin.learning.createArticle.mutate(payload());
      message.success('草稿已创建');
      await navigateTo(`/app/publish/article/${article.id}`, { replace: true });
      return article.id;
   } catch (error) {
      message.error('保存失败', error instanceof Error ? error.message : String(error));
      return undefined;
   } finally {
      saving.value = false;
   }
};

const togglePublished = async () => {
   let id = props.articleId;
   if (!id) {
      id = await save();
      if (!id) return;
   } else {
      const saved = await save();
      if (!saved) return;
   }

   publishing.value = true;
   try {
      if (status.value === 'PUBLISHED') {
         await $trpc.admin.learning.unpublishArticle.mutate({ id });
         status.value = 'DRAFT';
         message.success('文章已下架');
      } else {
         await $trpc.admin.learning.publishArticle.mutate({ id });
         status.value = 'PUBLISHED';
         message.success('文章已发布');
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
                     {{ articleId ? '编辑学习文章' : '创建学习文章' }}
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

         <div v-if="loading" class="py-20 text-center text-accent-300">正在加载文章…</div>
         <div v-else class="flex flex-col gap-5">
            <StCard class="!h-auto grid gap-4 lg:grid-cols-2">
               <label class="flex flex-col gap-2 text-sm text-accent-300">
                  标题
                  <StInput
                     v-model:value="title"
                     maxlength="200"
                     outer-class="bg-accent-700"
                     placeholder="文章标题" />
               </label>
               <label class="flex flex-col gap-2 text-sm text-accent-300">
                  简介
                  <StInput
                     v-model:value="summary"
                     maxlength="1000"
                     outer-class="bg-accent-700"
                     placeholder="一句话介绍文章" />
               </label>
               <div class="lg:col-span-2">
                  <div class="mb-2 text-sm text-accent-300">封面图片（可选）</div>
                  <StUploadImage
                     v-model:image-id="coverImageId"
                     v-model:image-url="coverImageUrl"
                     placeholder="上传文章封面" />
               </div>
            </StCard>

            <StCard class="!h-auto">
               <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                     <h2 class="st-font-capture text-lg text-white">Markdown 正文</h2>
                     <p class="mt-1 text-sm text-accent-300">支持 Markdown，并可插入题目与 Playground 指令。</p>
                  </div>
                  <StProblemPicker
                     v-model:value="selectedProblem"
                     class="w-full sm:w-80"
                     value-key="baseId"
                     :multiple="false"
                     :max="1"
                     placeholder="搜索并插入已发布题目"
                     @select="insertProblem" />
               </div>
               <StTextarea
                  v-model:value="source"
                  rows="24"
                  spellcheck="false"
                  outer-class="bg-accent-700 !p-4"
                  class="w-full resize-y font-mono text-sm leading-6"
                  placeholder="# 开始编写文章…" />
            </StCard>

            <LearningPlaygroundEditor
               v-model:playgrounds="playgrounds"
               @insert="insertPlayground"
               @remove="removePlaygroundDirective" />
         </div>
      </StSpace>
   </StSpace>
</template>
