<script setup lang="ts">
import { BookOne, Check, Close, School } from '@icon-park/vue-next';
import {
   courseTopics,
   useAllCourses,
   useLearningArticles,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';

/**
 * 课程审核。
 *
 * 课程是**唯一需要审核**的实体：发布页「提交审核」把 status 置为 pending，
 * 这里通过后置为 published，学习侧的「全部课程」才会出现它。
 * 文章与专题免审核，所以没有对应的审核页。
 */
useSeoMeta({ title: '课程审核 - Quanta Challenge' });

const message = useMessage();
const { courses, reviewCourseSubmission } = useLearningContentStore();

const pendingColumns: ITableColumn[] = [
   { key: 'name', title: '课程', skeletonClass: 'h-5 w-[5.5rem] rounded-md' },
   {
      key: 'topicCount',
      title: '专题数',
      width: '4.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'articleCount',
      title: '文章数',
      width: '4.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'problemCount',
      title: '题目数',
      width: '4.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'action',
      title: '操作',
      width: '6rem',
      align: 'center',
      skeletonClass: 'h-8 w-[4rem] rounded-md mx-auto',
   },
];

const publishedColumns: ITableColumn[] = [
   { key: 'name', title: '课程', skeletonClass: 'h-5 w-[5.5rem] rounded-md' },
   {
      key: 'topicCount',
      title: '专题数',
      width: '4.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'status',
      title: '状态',
      width: '6rem',
      align: 'center',
      skeletonClass: 'h-5 w-[3rem] rounded-md mx-auto',
   },
];

const content = useLearningContentStore();
const allCourses = useAllCourses(content);
const allArticles = useLearningArticles(content);

const rows = computed(() =>
   allCourses.map((course) => {
      const topics = courseTopics(course.id, content);
      const articleIds = new Set<number>();
      for (const topic of topics) {
         for (const id of topic.articleIds) articleIds.add(id);
      }
      const problems = allArticles
         .filter((article) => articleIds.has(article.id))
         .reduce((sum, article) => sum + article.problems.length, 0);

      return {
         id: course.id,
         name: course.name,
         description: course.description,
         status: course.status,
         topicCount: topics.length,
         articleCount: articleIds.size,
         problemCount: problems,
      };
   }),
);
const pending = computed(() => rows.value.filter((row) => row.status !== 'published'));
const published = computed(() => rows.value.filter((row) => row.status === 'published'));

const statusText = (status: string) =>
   status === 'published' ? '已上架' : status === 'pending' ? '待审核' : '草稿';

/** 通过＝把 status 改成 published；驳回＝退回草稿 */
const review = async (id: number, approve: boolean) => {
   const course = courses.value.find((item) => item.id === id);
   if (!course) return;

   // 通过 / 驳回走同一条接口：只有课程需要审核（§17.3）
   let saved;
   try {
      if (approve) {
         saved = await reviewCourseSubmission(id, true);
      } else {
         const reason = window.prompt('驳回理由（作者会看到）', '内容还不完整');
         if (!reason?.trim()) return;
         saved = await reviewCourseSubmission(id, false, reason.trim());
      }
   } catch (error) {
      message.error(approve ? '通过失败' : '驳回失败', (error as Error).message);
      return;
   }

   if (!saved) {
      message.error('操作失败', '没有找到这门课程');
      return;
   }
   message.success(
      approve ? '课程已通过' : '课程已驳回',
      approve
         ? `《${saved.name}》现在出现在学习侧的「全部课程」里`
         : `《${saved.name}》已退回草稿，发布页可以继续修改`,
   );
};

</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">课程审核</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ rows.length }} 门课程
            </span>
         </StSpace>

         <StSpace
            align="center"
            gap="0.5rem"
            fill-x
            class="p-4 rounded-[0.5rem] border border-accent-500 bg-accent-600/40">
            <School class="shrink-0 text-secondary" size="1rem" :strokeWidth="3" />
            <span class="st-font-tooltip text-accent-300">
               只有课程需要审核；文章与专题保存即可被引用。
            </span>
         </StSpace>

         <StSpace direction="vertical" gap="1rem" fill-x>
            <StSpace align="center" gap="0.625rem">
               <BookOne class="text-[1.375rem] text-accent-200" />
               <h2 class="st-font-third-bold text-white">待审核</h2>
               <span
                  class="st-font-tooltip text-accent-300 bg-accent-600 px-2 py-0.5 rounded-full">
                  {{ pending.length }} 个
               </span>
            </StSpace>

            <StTable
               :columns="pendingColumns"
               :rows="pending"
               row-key="id"
               :skeleton-count="2">
               <template #cell-name="{ row }">
                  <NuxtLink
                     :to="`/app/publish/course/${row.id}`"
                     class="block cursor-pointer">
                     <StPopover :content="row.description" placement="top">
                        <span class="block st-font-body-bold text-white truncate hover:text-primary transition-colors">
                           {{ row.name }}
                        </span>
                     </StPopover>
                  </NuxtLink>
               </template>

               <template #cell-topicCount="{ row }">
                  <span class="text-white font-family-manrope">{{ row.topicCount }}</span>
               </template>

               <template #cell-articleCount="{ row }">
                  <span class="text-white font-family-manrope">{{ row.articleCount }}</span>
               </template>

               <template #cell-problemCount="{ row }">
                  <span class="text-white font-family-manrope">{{ row.problemCount }}</span>
               </template>

               <template #cell-action="{ row }">
                  <StSpace align="center" justify="center" gap="1.25rem">
                     <button
                        type="button"
                        title="驳回"
                        aria-label="驳回"
                        class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-error active:scale-95 transition-all cursor-pointer"
                        @click="review(row.id, false)">
                        <Close class="text-[1.25rem]" />
                     </button>
                     <button
                        type="button"
                        title="通过"
                        aria-label="通过"
                        class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer"
                        @click="review(row.id, true)">
                        <Check class="text-[1.25rem]" />
                     </button>
                  </StSpace>
               </template>

               <template #empty>
                  <StSpace
                     fill
                     direction="vertical"
                     gap="0.75rem"
                     align="center"
                     justify="center"
                     class="text-accent-400 my-[20vh]">
                     <BookOne size="2.625rem" />
                     <div class="st-font-body-normal">暂无待审核课程</div>
                  </StSpace>
               </template>
            </StTable>
         </StSpace>

         <StSpace direction="vertical" gap="1rem" fill-x>
            <StSpace align="center" gap="0.625rem">
               <Check class="text-[1.375rem] text-accent-200" />
               <h2 class="st-font-third-bold text-white">已上架</h2>
               <span
                  class="st-font-tooltip text-accent-300 bg-accent-600 px-2 py-0.5 rounded-full">
                  {{ published.length }} 个
               </span>
            </StSpace>

            <StTable
               :columns="publishedColumns"
               :rows="published"
               row-key="id"
               :skeleton-count="2">
               <template #cell-name="{ row }">
                  <NuxtLink
                     :to="`/app/courses/${row.id}`"
                     class="block st-font-body-bold text-white truncate cursor-pointer hover:text-primary transition-colors">
                     {{ row.name }}
                  </NuxtLink>
               </template>

               <template #cell-topicCount="{ row }">
                  <span class="text-white font-family-manrope">{{ row.topicCount }}</span>
               </template>

               <template #cell-status="{ row }">
                  <span class="st-font-tooltip text-secondary">
                     {{ statusText(row.status) }}
                  </span>
               </template>

               <template #empty>
                  <StSpace
                     fill
                     direction="vertical"
                     gap="0.75rem"
                     align="center"
                     justify="center"
                     class="text-accent-400 my-[20vh]">
                     <School size="2.625rem" />
                     <div class="st-font-body-normal">还没有上架的课程</div>
                  </StSpace>
               </template>
            </StTable>
         </StSpace>

         <NuxtLink
            to="/app/manage"
            class="st-font-caption text-accent-300 hover:text-secondary transition-colors">
            返回管理后台
         </NuxtLink>
      </StSpace>
   </StSpace>
</template>
