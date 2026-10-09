<script setup lang="ts">
import { DocDetail, FileEditingOne, TableReport } from '@icon-park/vue-next';
import {
   topicsOfArticle,
   useLearningArticles,
   useLearningTopics,
} from '~/composables/use-learning';
import { useMessage } from '~/components/st/Message/use-message';

useSeoMeta({ title: '创建专题 - Quanta Challenge' });

const message = useMessage();

const staticNotice = () =>
   message.info('静态预览', '这一页还没接后端，按钮不会真的提交');

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const form = reactive({
   name: '',
   slug: '',
   description: '',
   weight: 10,
   prerequisites: [] as number[],
   articleIds: [] as number[],
});

const existingTopics = useLearningTopics();
const allArticles = useLearningArticles();

const togglePrerequisite = (id: number) => {
   const idx = form.prerequisites.indexOf(id);
   if (idx === -1) form.prerequisites.push(id);
   else form.prerequisites.splice(idx, 1);
};

const toggleArticle = (id: number) => {
   const idx = form.articleIds.indexOf(id);
   if (idx === -1) form.articleIds.push(id);
   else form.articleIds.splice(idx, 1);
};

const referencedBy = (articleId: number) =>
   topicsOfArticle(articleId)
      .map((t) => t.name)
      .join(' · ');

const canSubmit = computed(
   () => form.name.trim().length > 0 && form.articleIds.length > 0,
);
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">创建专题</h1>

         <StForm v-model:model-value="form" class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <StFormItem name="name" label="专题名称" required>
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
                        v-for="topic in existingTopics"
                        :key="topic.id"
                        :selected="form.prerequisites.includes(topic.id)"
                        :tag="{ name: topic.name }"
                        @click="togglePrerequisite(topic.id)" />
                  </div>
               </StFormItem>

               <StFormItem name="articles" label="引用文章" required>
                  <StSpace direction="vertical" gap="0.75rem" fill-x>
                     <div
                        v-for="article in allArticles"
                        :key="article.id"
                        class="p-4 rounded-[0.5rem] border flex items-center gap-3 transition-colors"
                        :class="
                           form.articleIds.includes(article.id)
                              ? 'border-secondary bg-accent-600'
                              : 'border-accent-300'
                        ">
                        <DocDetail
                           class="shrink-0 text-accent-200"
                           size="1rem"
                           :strokeWidth="3" />

                        <StSpace
                           direction="vertical"
                           gap="0.25rem"
                           class="min-w-0 flex-1">
                           <span
                              class="st-font-body-bold text-accent-100 truncate">
                              {{ article.title }}
                           </span>
                           <span
                              class="st-font-caption text-accent-300 truncate">
                              {{ article.summary }}
                           </span>
                        </StSpace>

                        <StSpace
                           direction="vertical"
                           gap="0.25rem"
                           class="shrink-0 text-right">
                           <span
                              class="st-font-tooltip text-accent-400 font-family-manrope">
                              {{ article.problems.length }} 题
                           </span>
                           <span
                              v-if="referencedBy(article.id)"
                              class="st-font-tooltip text-accent-400">
                              已被 {{ referencedBy(article.id) }} 引用
                           </span>
                        </StSpace>

                        <StButton
                           size="sm"
                           :bordered="!form.articleIds.includes(article.id)"
                           @click="toggleArticle(article.id)">
                           <span>
                              {{
                                 form.articleIds.includes(article.id)
                                    ? '移除'
                                    : '引用'
                              }}
                           </span>
                        </StButton>
                     </div>
                  </StSpace>
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
                  <StButton size="sm" bordered @click="staticNotice">
                     <StSpace align="center" gap="0.375rem">
                        <FileEditingOne size="1rem" />
                        <span>去写新文章</span>
                     </StSpace>
                  </StButton>
               </StSpace>
            </StSpace>

            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem]">
               <div class="text-accent-300">
                  {{
                     canSubmit
                        ? '已经自动保存'
                        : '填好专题名称，并至少引用 1 篇文章'
                  }}
               </div>
               <StSpace gap="1rem" align="center">
                  <StButton bordered @click="staticNotice">
                     <span>保存草稿</span>
                  </StButton>
                  <StButton :disabled="!canSubmit" @click="staticNotice">
                     <span>提交审核</span>
                  </StButton>
               </StSpace>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
