<script setup lang="ts">
import {
   Back,
   BookOpen,
   CloseSmall,
   Delete,
   Edit,
   Plus,
   Search,
   UploadTwo,
} from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import CloudFunctionStatsGrid from '~/components/cloud-function/StatsGrid.vue';
import CourseStatusBadge from '~/components/course-admin/CourseStatusBadge.vue';
import { logger } from '~~/lib/logger';
import { COURSE_STATUS_META, type AdminCourseRow, type CourseStatus } from '~/types/course-admin';

useSeoMeta({ title: '课程管理 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const message = useMessage();

const { data, pending, error, refresh } = useAsyncData('manage-courses', () =>
   $trpc.admin.course.list.query(),
);

watch(
   error,
   (value) => {
      if (!value) return;
      logger.error(value, '加载课程列表失败');
      message.error('课程加载失败', '请检查网络连接或稍后重试');
   },
   { immediate: true },
);

const courses = computed(() => data.value ?? []);

const stats = computed(() => {
   const list = courses.value;
   const countOf = (status: CourseStatus) => list.filter((course) => course.status === status).length;
   return [
      { label: '课程总数', value: list.length, color: 'text-white' },
      { label: '已发布', value: countOf('published'), color: 'text-success' },
      { label: '草稿', value: countOf('draft'), color: 'text-accent-200' },
      {
         label: '累计学员',
         value: list.reduce((total, course) => total + course.enrollmentCount, 0),
         color: 'text-secondary',
      },
   ];
});

// ── 筛选 ──────────────────────────────────────────────────────────────
type StatusFilter = 'all' | CourseStatus;
const statusFilter = ref<StatusFilter>('all');
const keyword = ref('');

const filterOptions = computed(() => [
   { label: '全部', value: 'all' as StatusFilter, count: courses.value.length },
   ...(Object.keys(COURSE_STATUS_META) as CourseStatus[]).map((status) => ({
      label: COURSE_STATUS_META[status].label,
      value: status as StatusFilter,
      count: courses.value.filter((course) => course.status === status).length,
   })),
]);

const rows = computed(() => {
   const q = keyword.value.trim().toLowerCase();
   return courses.value.filter(
      (course) =>
         (statusFilter.value === 'all' || course.status === statusFilter.value) &&
         (!q || course.title.toLowerCase().includes(q) || course.summary.toLowerCase().includes(q)),
   );
});

const columns: ITableColumn[] = [
   { key: 'course', title: '课程', skeletonClass: 'h-12 w-[16rem] rounded-lg' },
   { key: 'status', title: '状态', width: '7rem' },
   { key: 'content', title: '内容', width: '7.5rem', class: 'max-md:hidden' },
   { key: 'learners', title: '学员', width: '5.5rem', class: 'max-md:hidden' },
   { key: 'updatedAt', title: '最近编辑', width: '8.5rem', class: 'max-md:hidden' },
   { key: 'action', title: '操作', width: '8.5rem', align: 'center' },
];

const editCourse = (course: AdminCourseRow) => navigateTo(`/app/publish/course/${course.id}`);

// ── 行内操作 ──────────────────────────────────────────────────────────
const busyId = ref<string | null>(null);

const togglePublish = async (course: AdminCourseRow) => {
   const publish = course.status !== 'published';
   const confirmed = await dialog.confirm(
      publish
         ? {
              title: '发布课程',
              description: `发布后「${course.title}」将出现在学习课程列表中，所有成员都可以获取并学习。`,
              confirmText: '发布',
              cancelText: '取消',
           }
         : {
              title: '下架课程',
              description: `下架后学员将无法继续学习「${course.title}」，学习记录会保留。`,
              variant: 'danger',
              confirmText: '下架',
              cancelText: '取消',
           },
   );
   if (!confirmed) return;
   busyId.value = course.id;
   try {
      await $trpc.admin.course.setStatus.mutate({ id: course.id, publish });
      message.success(publish ? '课程已发布' : '课程已下架');
      await refresh();
   } catch (err) {
      message.error(publish ? '发布失败' : '下架失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      busyId.value = null;
   }
};

const removeCourse = async (course: AdminCourseRow) => {
   const confirmed = await dialog.confirm({
      title: '删除课程',
      description: course.enrollmentCount
         ? `「${course.title}」已有 ${course.enrollmentCount} 名学员，删除后其学习进度、评分与评论将一并清除，且不可撤销。若只是暂停学习，建议改为下架。`
         : `确定要删除「${course.title}」吗？课程的全部章节与小节将一并删除，此操作不可撤销。`,
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
   });
   if (!confirmed) return;
   busyId.value = course.id;
   try {
      await $trpc.admin.course.remove.mutate({ id: course.id });
      message.success('课程已删除');
      await refresh();
   } catch (err) {
      message.error('删除失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      busyId.value = null;
   }
};

const actionButtonClass =
   'flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-wait';
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[64rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <StSpace justify="between" align="end" gap="1rem" fill-x>
            <StSpace align="end" gap="1rem">
               <h1 class="st-font-hero-bold text-accent-100 max-md:text-[1.5rem] max-md:leading-[1.2]">
                  课程管理
               </h1>
               <span
                  class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full max-md:hidden">
                  共 {{ courses.length }} 门课程
               </span>
            </StSpace>
            <StButton
               class="shrink-0 py-[0.375rem] px-[1rem] text-accent-100 !rounded-[0.5rem]"
               @click="navigateTo('/app/publish/course')">
               <div class="flex gap-1.5 items-center">
                  <Plus class="text-[1.125rem]" />
                  <span>新建课程</span>
               </div>
            </StButton>
         </StSpace>

         <CloudFunctionStatsGrid :items="stats" />

         <!-- 工具栏：搜索 + 状态筛选 -->
         <StSpace
            fill-x
            justify="between"
            align="center"
            gap="1rem"
            class="max-md:flex-col max-md:items-stretch max-md:gap-3!">
            <div
               class="flex items-center gap-2 bg-accent-600 rounded-xl px-4 h-[3rem] w-[18rem] max-md:w-full shrink-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50">
               <Search class="text-accent-300 text-lg shrink-0" />
               <input
                  v-model="keyword"
                  type="text"
                  placeholder="搜索课程标题 / 简介"
                  class="flex-1 bg-transparent border-none outline-none text-white placeholder:text-accent-400 text-sm min-w-0" />
               <button
                  v-if="keyword"
                  type="button"
                  aria-label="清空搜索"
                  class="text-accent-300 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-accent-500"
                  @click="keyword = ''">
                  <CloseSmall class="text-lg" />
               </button>
            </div>

            <div class="flex items-center gap-1 rounded-xl bg-accent-600 p-1 overflow-x-auto">
               <button
                  v-for="option in filterOptions"
                  :key="option.value"
                  type="button"
                  class="flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-1.5 st-font-caption transition-colors cursor-pointer max-md:flex-1 max-md:justify-center"
                  :class="
                     statusFilter === option.value
                        ? 'bg-accent-500 text-white'
                        : 'text-accent-300 hover:text-white'
                  "
                  @click="statusFilter = option.value">
                  {{ option.label }}
                  <span class="text-accent-400">{{ option.count }}</span>
               </button>
            </div>
         </StSpace>

         <StTable
            :columns="columns"
            :rows="rows"
            :loading="pending"
            row-key="id"
            :skeleton-count="5"
            clickable-rows
            @row-click="editCourse">
            <template #cell-course="{ row }">
               <StSpace align="center" gap="0.875rem" class="min-w-0">
                  <StImage
                     :src="row.coverImage ? `/api/static/${row.coverImage.name}` : ''"
                     :alt="`${row.title}封面`"
                     width="3rem"
                     height="3rem"
                     class="shrink-0 overflow-hidden rounded-lg">
                     <template #fallback="{ style }">
                        <StSpace fill center class="rounded-lg bg-accent-500 text-accent-300" :style="style">
                           <BookOpen size="1.25rem" />
                        </StSpace>
                     </template>
                  </StImage>
                  <StSpace direction="vertical" gap="0.125rem" class="min-w-0 flex-1">
                     <span class="st-font-body-normal text-white truncate w-full">{{ row.title }}</span>
                     <span class="st-font-caption text-accent-400 truncate w-full">
                        {{ row.summary || '暂无课程简介' }}
                     </span>
                  </StSpace>
               </StSpace>
            </template>

            <template #cell-status="{ row }">
               <CourseStatusBadge :status="row.status" />
            </template>

            <template #cell-content="{ row }">
               <span class="st-font-caption text-accent-200 whitespace-nowrap">
                  {{ row.chapterCount }} 章 · {{ row.sectionCount }} 节
               </span>
            </template>

            <template #cell-learners="{ row }">
               <span class="st-font-body-normal text-accent-100">{{ row.enrollmentCount }}</span>
            </template>

            <template #cell-updatedAt="{ row }">
               <span class="st-font-caption text-accent-300 whitespace-nowrap">
                  {{ dayjs(row.updatedAt).format('YYYY-MM-DD HH:mm') }}
               </span>
            </template>

            <template #cell-action="{ row }">
               <StSpace align="center" justify="center" gap="0.5rem" @click.stop>
                  <button
                     type="button"
                     title="编辑课程"
                     aria-label="编辑课程"
                     :class="[actionButtonClass, 'hover:text-secondary']"
                     @click="editCourse(row)">
                     <Edit class="text-[1.25rem]" />
                  </button>
                  <button
                     type="button"
                     :title="row.status === 'published' ? '下架课程' : '发布课程'"
                     :aria-label="row.status === 'published' ? '下架课程' : '发布课程'"
                     :disabled="busyId === row.id"
                     :class="[actionButtonClass, row.status === 'published' ? 'hover:text-warning' : 'hover:text-success']"
                     @click="togglePublish(row)">
                     <Back v-if="row.status === 'published'" class="text-[1.25rem]" />
                     <UploadTwo v-else class="text-[1.25rem]" />
                  </button>
                  <button
                     type="button"
                     title="删除课程"
                     aria-label="删除课程"
                     :disabled="busyId === row.id"
                     :class="[actionButtonClass, 'hover:text-error']"
                     @click="removeCourse(row)">
                     <Delete class="text-[1.25rem]" />
                  </button>
               </StSpace>
            </template>

            <template #skeleton-action="{ itemClass }">
               <StSpace align="center" justify="center" gap="0.75rem">
                  <StSkeletonItem v-for="i in 3" :key="i" class="size-5 rounded-md" :class="itemClass" />
               </StSpace>
            </template>

            <template #empty>
               <StSpace
                  fill
                  direction="vertical"
                  gap="0.75rem"
                  align="center"
                  justify="center"
                  class="text-accent-400 my-[16vh]">
                  <BookOpen size="2.625rem" />
                  <div class="st-font-body-normal">
                     {{ courses.length ? '没有符合条件的课程' : '还没有课程' }}
                  </div>
                  <NuxtLink
                     v-if="!courses.length"
                     to="/app/publish/course"
                     class="st-font-caption text-primary hover:underline">
                     去发布第一门课程 →
                  </NuxtLink>
               </StSpace>
            </template>
         </StTable>
      </StSpace>
   </StSpace>
</template>
