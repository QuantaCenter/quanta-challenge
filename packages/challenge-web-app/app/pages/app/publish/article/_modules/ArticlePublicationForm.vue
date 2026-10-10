<script setup lang="ts">
import {
   DocDetail,
   FileCollection,
   SaveOne,
   UploadTwo,
} from '@icon-park/vue-next';
import {
   articleMarkdown,
   topicsOfArticle,
   useLearningArticle,
   useLearningProblemBank,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useMessage } from '~/components/st/Message/use-message';
import {
   SUMMARY_MAX,
   TITLE_MAX,
   useArticlePublicationForm,
} from '../_composables/use-article-publication-form';
import ArticleBodyEditor from './ArticleBodyEditor.vue';
import ArticleCoverPicker from './ArticleCoverPicker.vue';

const props = withDefaults(
   defineProps<{
      mode?: 'create' | 'edit';
      articleId?: string | number;
   }>(),
   { mode: 'create', articleId: undefined },
);

const message = useMessage();
const bank = useLearningProblemBank();
const { addArticle, editArticle } = useLearningContentStore();

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const content = useLearningContentStore();
const article = computed(() =>
   props.mode === 'edit' && props.articleId !== undefined
      ? useLearningArticle(props.articleId, content)
      : undefined,
);

const owners = computed(() =>
   article.value ? topicsOfArticle(article.value.id, content) : [],
);

const { draft, formKey, form, rules, blockedReason, canSubmit, reset } =
   useArticlePublicationForm(
      props.mode === 'create' ? 'articlePublishFormdata' : undefined,
   );

// 编辑已发布的文章时以文章内容为准；新建时保留本地草稿，不被空值覆盖
const prefill = () => {
   const source = article.value;
   if (!source) return;
   draft.value = {
      title: source.title,
      slug: source.slug,
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
// 提交后回上一页：上一页读的是同一份内容状态，内容一变它自然就是新的
const backAfterSubmit = () => goBackOr(router, '/app/publish/content');

const saveDraft = () => {
   message.success(
      '草稿已保存',
      props.mode === 'create'
         ? '正文与封面存在浏览器本地，刷新后还在'
         : '改动先留在表单里，点「保存修改」才会写回内容库',
   );
};

// 文章不需要审核：保存即可见（只有课程需要审核）。
const submitting = ref(false);

const submitArticle = async () => {
   if (!form.value || submitting.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error('表单填写有误', `请检查 ${invalidField} 项`);
      return;
   }

   const payload = {
      title: draft.value.title,
      slug: draft.value.slug,
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
   // 发布成功就把草稿清掉：下次「发布文章」不该还留着上一次的内容
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
         class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem" fill-x>
            <h1 class="st-font-hero-bold">
               {{ mode === 'create' ? '发布文章' : '编辑文章' }}
            </h1>
            <StTag
               v-if="article"
               size="small"
               color="#434343"
               :content="`#${article.id}`" />
         </StSpace>

         <StSpace direction="vertical" gap="0.5rem" fill-x>
            <StSpace
               v-if="owners.length"
               align="center"
               gap="0.375rem"
               class="flex-wrap">
               <span class="st-font-tooltip text-accent-400">
                  当前已被
               </span>
               <NuxtLink
                  v-for="topic in owners"
                  :key="topic.id"
                  :to="`/app/topics/${topic.id}`"
                  class="st-font-tooltip text-secondary hover:opacity-75 transition-opacity">
                  {{ topic.name }}
               </NuxtLink>
               <span class="st-font-tooltip text-accent-400">引用</span>
            </StSpace>
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
               <StFormItem name="title" label="文章标题" required>
                  <StInput
                     v-model:value="draft.title"
                     :maxlength="TITLE_MAX"
                     placeholder="例如：布局"
                     :outer-class />
               </StFormItem>

               <StSpace gap="1.5rem" fill-x>
                  <StFormItem name="slug" label="英文标识">
                     <StInput
                        v-model:value="draft.slug"
                        placeholder="例如：css-layout"
                        :outer-class />
                  </StFormItem>
                  <StFormItem name="summary" label="一句话摘要" required>
                     <StInput
                        v-model:value="draft.summary"
                        :maxlength="SUMMARY_MAX"
                        placeholder="它出现在文章列表与专题页里"
                        :outer-class />
                  </StFormItem>
               </StSpace>

               <StFormItem name="cover" label="文章封面">
                  <ArticleCoverPicker
                     v-model:mode="draft.coverMode"
                     v-model:preset="draft.coverPreset"
                     v-model:url="draft.coverUrl"
                     v-model:image-id="draft.coverImageId" />
               </StFormItem>

               <StFormItem name="body" label="正文" required>
                  <ArticleBodyEditor v-model:value="draft.body" :bank="bank" />
               </StFormItem>

            </StSpace>

            <NuxtLink
               to="/app/publish/content"
               target="_blank"
               class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1 px-2 mt-4">
               <FileCollection size="0.875rem" />
               内容库
            </NuxtLink>

            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem]">
               <StSpace gap="1rem" align="center">
                  <StButton bordered @click="saveDraft">
                     <StSpace align="center" gap="0.375rem">
                        <SaveOne size="1.25rem" />
                        <span>保存草稿</span>
                     </StSpace>
                  </StButton>
                  <StButton
                     :disabled="!canSubmit || submitting"
                     @click="submitArticle">
                     <StSpace align="center" gap="0.375rem">
                        <UploadTwo size="1.25rem" />
                        <span>{{ mode === 'edit' ? '保存' : '发布' }}</span>
                     </StSpace>
                  </StButton>
               </StSpace>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
