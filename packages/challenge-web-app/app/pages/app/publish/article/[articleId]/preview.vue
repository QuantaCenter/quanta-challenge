<script setup lang="ts">
import { DocDetail, FileEditingOne, Left, Right } from '@icon-park/vue-next';
import {
   articleProgress,
   useLearningArticle,
   type ContentBlock,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { articleContentItems } from '~/utils/learning-markdown';
import { renderInline, renderParagraph } from '~/utils/inline-markdown';
import { useLearningVisits } from '~/composables/use-learning-visits';

/**
 * 文章预览（创作侧）。
 *
 * 为什么需要它：学习侧的文章页地址必须带专题上下文
 * （`/app/topics/:topicId/:articleId`，§7.1），所以**还没被任何专题引用的文章
 * 在学习侧是点不开的**。写完之后想看一眼效果，就得有这么一个不带上下文的预览页。
 */
const route = useRoute();
const articleId = computed(() => String(route.params.articleId));

const content = useLearningContentStore();
const visits = useLearningVisits();
const article = computed(() => useLearningArticle(articleId.value, content));
const state = computed(() =>
   article.value ? articleProgress(article.value, visits.slice.value) : undefined,
);
const items = computed(() =>
   article.value ? articleContentItems(article.value) : [],
);

const textOf = (block: ContentBlock) => ('text' in block ? block.text : '');
const itemsOf = (block: ContentBlock) => ('items' in block ? block.items : []);
const html = (text: string) => renderInline(text);
const paragraphHtml = (text: string) => renderParagraph(text);

useSeoMeta({
   title: computed(() =>
      article.value ? `预览：${article.value.title}` : '文章预览',
   ),
});
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StEmptyStatus
         v-if="!article"
         content="没有这篇文章"
         class="pt-[10rem]" />

      <StSpace
         v-else
         direction="vertical"
         gap="1.5rem"
         class="w-[52rem] pb-[10rem] my-6">
         <StSpace align="center" gap="0.5rem" fill-x>
            <NuxtLink
               to="/app/publish/content"
               class="st-font-caption text-accent-300 hover:text-secondary transition-colors flex items-center gap-1">
               <Left size="0.875rem" />
               内容库
            </NuxtLink>
            <Right size="0.75rem" class="text-accent-400" />
            <span class="st-font-caption text-accent-100">预览</span>
            <NuxtLink
               :to="`/app/publish/article/${article.id}`"
               class="ml-auto">
               <StButton size="sm" bordered>
                  <StSpace align="center" gap="0.375rem">
                     <FileEditingOne size="1rem" />
                     <span>去编辑</span>
                  </StSpace>
               </StButton>
            </NuxtLink>
         </StSpace>

         <StSpace direction="vertical" gap="0.5rem" fill-x>
            <StSpace align="center" gap="0.75rem">
               <DocDetail
                  class="text-secondary shrink-0"
                  size="1.75rem"
                  :strokeWidth="3" />
               <h1 class="text-[2rem] font-bold text-white">
                  {{ article.title }}
               </h1>
            </StSpace>
            <p class="st-font-body-normal text-accent-300">
               {{ article.summary }}
            </p>
            <span class="st-font-tooltip text-accent-400 font-family-manrope">
               {{ state?.total ?? 0 }} 道题 · 未被任何专题引用时，学习侧打不开这篇文章
            </span>
         </StSpace>

         <div class="w-full h-[1px] bg-accent-500"></div>

         <article class="w-full min-w-0">
            <template v-for="(item, idx) in items" :key="idx">
               <LearningProblemBlock
                  v-if="item.kind === 'problem'"
                  :problem="item.problem"
                  :index="
                     items
                        .slice(0, idx + 1)
                        .filter((entry) => entry.kind === 'problem').length - 1
                  "
                  variant="source" />

               <h2
                  v-else-if="item.block.type === 'heading'"
                  class="text-[1.375rem] font-bold text-white mt-10 mb-4 first:mt-0"
                  v-html="html(textOf(item.block))" />

               <p
                  v-else-if="item.block.type === 'paragraph'"
                  class="st-font-body-normal text-accent-200 leading-[1.9] my-5 w-full"
                  v-html="paragraphHtml(textOf(item.block))" />

               <ul
                  v-else-if="item.block.type === 'list'"
                  class="my-5 pl-5 list-disc text-accent-200 st-font-body-normal leading-[1.9] space-y-2 w-full">
                  <li
                     v-for="(entry, i) in itemsOf(item.block)"
                     :key="i"
                     v-html="html(entry)" />
               </ul>

               <pre
                  v-else-if="item.block.type === 'code'"
                  class="my-6 p-5 rounded-[0.75rem] border border-accent-500 bg-simple-editor-background overflow-x-auto"><code
                  class="st-font-caption text-accent-100 font-family-mono">{{ textOf(item.block) }}</code></pre>

               <div
                  v-else-if="item.block.type === 'callout'"
                  class="my-6 p-4 rounded-[0.75rem] bg-warning/10 border-l-2 border-warning st-font-caption text-accent-200 leading-[1.8]"
                  v-html="html(textOf(item.block))" />
            </template>
         </article>
      </StSpace>
   </StSpace>
</template>

<style scoped src="@/assets/css/utils.css"></style>
