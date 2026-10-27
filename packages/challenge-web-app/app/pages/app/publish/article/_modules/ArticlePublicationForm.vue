<script setup lang="ts">
import { PreviewOpen, UploadTwo } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import {
   articleMarkdown,
   useLearningArticle,
   useLearningArticles,
   type ArticleInput,
   type LearningArticle,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useProblemBank } from '~/components/learning/ContentPicker.vue';
import useAuthStore from '~/stores/auth-store';
import { useMessage } from '~/components/st/Message/use-message';
import {
   SUMMARY_MAX,
   TITLE_MAX,
   useArticlePublicationForm,
} from '../_composables/use-article-publication-form';
import ArticleBodyEditor from './ArticleBodyEditor.vue';
import ArticleCoverPicker from './ArticleCoverPicker.vue';
import ArticlePreviewPage from './ArticlePreviewPage.vue';

const props = withDefaults(
   defineProps<{
      mode?: 'create' | 'edit';
      articleId?: string | number;
   }>(),
   { mode: 'create', articleId: undefined },
);

const message = useMessage();
const { problems: bank } = useProblemBank();
const authStore = useAuthStore();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const content = useLearningContentStore();
const article = computed(() =>
   props.mode === 'edit' && props.articleId !== undefined
      ? useLearningArticle(props.articleId, content)
      : undefined,
);

// 整页预览：数据来自本地草稿
const previewOpened = ref(false);
const allArticles = useLearningArticles(content);

// 作者：编辑时沿用原文章的作者；新建时是当前登录用户
const previewAuthorName = computed(() =>
   props.mode === 'edit'
      ? article.value?.authorName
      : (authStore.user?.displayName || authStore.user?.name),
);
const previewAuthorAvatarUrl = computed(() => {
   if (props.mode === 'edit') return article.value?.authorAvatarUrl ?? null;
   // 头像取数据库文件名，与 app-layout 逻辑一致
   const user = authStore.user as
      | (typeof authStore.user & { avatar?: { name?: string } | null })
      | null;
   const name = user?.avatar?.name;
   if (name) return `/api/static/${name}`;
   return user?.imageId ? `/api/static/${user.imageId}` : '';
});
const previewAuthorCount = computed(() => {
   const name = previewAuthorName.value;
   if (!name) return 0;
   return allArticles.filter((item) => item.authorName === name).length;
});
// 发布时间：编辑沿用原时间；新建按「今天」预览
const previewPublishDate = computed(() =>
   props.mode === 'edit' && article.value?.createdAt
      ? dayjs(article.value.createdAt).format('YYYY-MM-DD')
      : dayjs().format('YYYY-MM-DD'),
);

const { draft, formKey, form, rules, blockedReason, canSubmit, reset } =
   useArticlePublicationForm(
      props.mode === 'create' ? 'articlePublishFormdata' : undefined,
   );

// 编辑时以文章内容回填表单
const prefill = () => {
   const source = article.value;
   if (!source) return;
   draft.value = {
      title: source.title,
      summary: source.summary,
      body: articleMarkdown(source),
      coverMode: source.coverUrl ? 'custom' : 'preset',
      coverPreset: source.coverPreset ?? 'slate',
      coverUrl: source.coverUrl ?? '',
      coverImageId: '',
   };
};

watch(article, prefill, { immediate: true });

const router = useRouter();
// 提交后回上一页，同一份内容状态自然展示新数据
const backAfterSubmit = () => goBackOr(router, '/app/manage/content');

// 新建时草稿自动存入 localStorage，这里只记录落盘时间
const lastSavedAt = ref<Date | null>(null);
if (props.mode === 'create') {
   watch(
      draft,
      () => {
         lastSavedAt.value = new Date();
      },
      { deep: true },
   );
   onMounted(() => {
      lastSavedAt.value = new Date();
   });
}

// 文章不需要审核，保存即可见
const submitting = ref(false);

/* ----- 文章写请求：服务端 cuid 与前端数字 id 的转换在这里完成 ----- */

const addArticle = async (input: ArticleInput): Promise<LearningArticle> => {
   const { $trpc } = useNuxtApp();
   const created = (await $trpc.admin.learning.createArticle.mutate({
      title: input.title,
      summary: input.summary,
      source: input.body,
      coverPreset: input.coverPreset ?? 'slate',
      coverUrl: input.coverUrl || null,
   })) as { id: string };
   const state = await content.refresh();
   const article = state?.articles.find((item) => item.cuid === created.id);
   if (!article) throw new Error('文章已创建但读取失败');
   return article;
};

const editArticle = async (
   id: number,
   input: ArticleInput,
): Promise<LearningArticle | undefined> => {
   const current = content.articles.value.find((item) => item.id === id);
   if (!current?.cuid) return undefined;
   const { $trpc } = useNuxtApp();
   await $trpc.admin.learning.updateArticle.mutate({
      id: current.cuid,
      title: input.title,
      summary: input.summary,
      source: input.body,
      coverPreset: input.coverPreset ?? 'slate',
      coverUrl: input.coverUrl || null,
   });
   const state = await content.refresh();
   return state?.articles.find((item) => item.id === id);
};

const submitArticle = async () => {
   if (!form.value || submitting.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error('表单填写有误', `请检查 ${invalidField} 项`);
      return;
   }

   const payload = {
      title: draft.value.title,
      summary: draft.value.summary,
      body: draft.value.body,
      coverPreset: draft.value.coverPreset,
      coverUrl: draft.value.coverMode === 'custom' ? draft.value.coverUrl : '',
   };

   const editing = props.mode === 'edit' && props.articleId !== undefined;
   submitting.value = true;
   let saved;
   try {
      saved = editing
         ? await editArticle(Number(props.articleId), payload)
         : await addArticle(payload);
   } catch (error) {
      message.error('保存失败', (error as Error).message);
      return;
   } finally {
      submitting.value = false;
   }

   if (!saved) {
      message.error('保存失败', '没有找到这篇文章，可能已经被删掉了');
      return;
   }

   message.success(
      editing ? '文章已更新' : '文章已发布',
      `《${saved.title}》引用了 ${saved.problems.length} 道题，专题里现在就能搜到它`,
   );
   // 发布成功后清掉草稿
   if (!editing) reset();
   backAfterSubmit();
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StEmptyStatus
         v-if="mode === 'edit' && !article"
         content="没有这篇文章"
         class="pt-[10rem]" />

      <StSpace
         v-else
         direction="vertical"
         gap="1.5rem"
         class="w-[56rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem" fill-x>
            <h1 class="st-font-hero-bold">
               {{ mode === 'create' ? '发布文章' : '编辑文章' }}
            </h1>
         </StSpace>

         <StForm
            v-model:model-value="draft"
            :ref="formKey"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <ArticleCoverPicker
                  v-model:mode="draft.coverMode"
                  v-model:preset="draft.coverPreset"
                  v-model:url="draft.coverUrl"
                  v-model:image-id="draft.coverImageId" />

               <StFormItem name="title" label="文章标题" required>
                  <StInput
                     v-model:value="draft.title"
                     :maxlength="TITLE_MAX"
                     placeholder="例如：布局"
                     :outer-class />
               </StFormItem>

               <StFormItem name="summary" label="一句话摘要" required>
                  <StInput
                     v-model:value="draft.summary"
                     :maxlength="SUMMARY_MAX"
                     placeholder="它出现在文章列表与专题页里"
                     :outer-class />
               </StFormItem>

               <StFormItem name="body" label="正文" required>
                  <ArticleBodyEditor v-model:value="draft.body" :bank="bank" />
               </StFormItem>

            </StSpace>

            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem]">
               <span
                  v-if="lastSavedAt"
                  class="st-font-body-normal text-accent-300">
                  草稿已自动保存 · {{ dayjs(lastSavedAt).format('HH:mm:ss') }}
               </span>
               <span v-else />
               <StSpace gap="1rem" align="center">
                  <StButton bordered @click="previewOpened = true">
                     <StSpace align="center" gap="0.375rem">
                        <PreviewOpen size="1.25rem" />
                        <span>预览</span>
                     </StSpace>
                  </StButton>
                  <StButton
                     :disabled="!canSubmit || submitting"
                     @click="submitArticle">
                     <StSpace align="center" gap="0.375rem">
                        <UploadTwo size="1.25rem" />
                        <span>{{ mode === 'edit' ? '保存' : '发布文章' }}</span>
                     </StSpace>
                  </StButton>
               </StSpace>
            </StSpace>
         </StForm>
      </StSpace>

      <!-- 整页预览：数据只在本地 -->
      <div
         v-if="previewOpened"
         class="fixed inset-0 z-[10010] overflow-auto bg-background">
         <StSpace direction="vertical" align="center" class="min-h-full">
            <ArticlePreviewPage
               :title="draft.title"
               :summary="draft.summary"
               :body="draft.body"
               :cover-preset="draft.coverPreset"
               :cover-url="draft.coverMode === 'custom' ? draft.coverUrl : ''"
               :bank="bank"
               :author-name="previewAuthorName"
               :author-avatar-url="previewAuthorAvatarUrl"
               :author-article-count="previewAuthorCount"
               :publish-date="previewPublishDate"
               @back="previewOpened = false" />
         </StSpace>
      </div>
   </StSpace>
</template>
