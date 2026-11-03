<script setup lang="ts">
import {
   ArrowLeft,
   BookOpen,
   Delete,
   ListTwo,
   PreviewOpen,
   Plus,
   Save,
   SettingTwo,
   UploadTwo,
   Back,
} from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { StForm } from '#components';
import type { IRule } from '~/components/st/Form/type';
import CloudFunctionStatsGrid from '~/components/cloud-function/StatsGrid.vue';
import CourseInfoFields from '~/components/course-admin/CourseInfoFields.vue';
import CourseStatusBadge from '~/components/course-admin/CourseStatusBadge.vue';
import CoursePublishChecklist from './_components/CoursePublishChecklist.vue';
import OutlineChapter from './_components/OutlineChapter.vue';
import ChapterEditingDrawer from './_drawers/ChapterEditingDrawer.vue';
import SectionEditingDrawer from './_drawers/SectionEditingDrawer.vue';
import { useCourseEditor } from './_composables/use-course-editor';

const route = useRoute();
const courseId = computed(() => String(route.params.id));

const {
   data,
   pending,
   info,
   infoDirty,
   savingInfo,
   saveInfo,
   stats,
   issues,
   issueSectionIds,
   issueChapterIds,
   switchingStatus,
   togglePublish,
   removeCourse,
   busyId,
   move,
   addStage,
   removeChapter,
   removeStage,
   removeSection,
   chapterDrawer,
   openChapterDrawer,
   sectionDrawer,
   openSectionDrawer,
   handleDrawerSaved,
} = useCourseEditor(courseId);

useSeoMeta({ title: () => `${data.value?.title ?? '编辑课程'} - Quanta Challenge` });

const tabs = [
   { label: '课程大纲', value: 'outline' },
   { label: '基本信息', value: 'info' },
];
const activeTab = ref('outline');

const infoRules: IRule[] = [
   {
      field: 'title',
      required: true,
      validator: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 50,
   },
];
const infoForm = useTemplateRef<InstanceType<typeof StForm>>('info-form');
const handleSaveInfo = async () => {
   if (!infoForm.value?.validate().success) return;
   await saveInfo();
};

const isPublished = computed(() => data.value?.status === 'published');
const canPublish = computed(() => isPublished.value || issues.value.length === 0);
const sectionCount = computed(() => Number(stats.value[1]?.value ?? 0));
const coverUrl = computed(() => (data.value?.coverImage ? `/api/static/${data.value.coverImage.name}` : ''));
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="2rem"
         class="w-full max-w-[56rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <NuxtLink
            to="/app/manage/course"
            class="flex w-fit items-center gap-2 text-accent-300 transition-colors hover:text-white">
            <ArrowLeft class="text-[1.125rem]" />
            <span class="st-font-caption">返回课程管理</span>
         </NuxtLink>

         <!-- 加载骨架 -->
         <StSpace v-if="pending && !data" direction="vertical" gap="1.5rem" fill-x>
            <StSpace align="center" gap="1.25rem" fill-x>
               <StSkeletonItem class="size-[5.5rem] shrink-0" rounded="lg" />
               <StSpace direction="vertical" gap="0.75rem" class="flex-1">
                  <StSkeletonItem class="h-5 w-24" rounded="lg" />
                  <StSkeletonItem class="h-9 w-2/3" rounded="lg" />
               </StSpace>
            </StSpace>
            <StSkeletonItem class="h-[5rem] w-full" rounded="lg" />
            <StSkeletonItem class="h-[20rem] w-full" rounded="lg" />
         </StSpace>

         <template v-else-if="data">
            <!-- Hero -->
            <StSpace
               justify="between"
               align="center"
               gap="1.5rem"
               class="w-full max-md:flex-col max-md:items-start max-md:gap-4!">
               <StSpace align="center" gap="1.25rem" class="min-w-0 flex-1">
                  <StImage
                     :src="coverUrl"
                     :alt="`${data.title}封面`"
                     width="5.5rem"
                     height="5.5rem"
                     class="shrink-0 overflow-hidden rounded-xl max-md:w-[4rem]! max-md:h-[4rem]!">
                     <template #fallback="{ style }">
                        <StSpace fill center class="rounded-xl bg-accent-600 text-accent-300" :style="style">
                           <BookOpen size="2rem" />
                        </StSpace>
                     </template>
                  </StImage>
                  <StSpace direction="vertical" gap="0.5rem" class="min-w-0 flex-1">
                     <StSpace align="center" gap="0.75rem" wrap>
                        <CourseStatusBadge :status="data.status" />
                        <span class="st-font-caption text-accent-400">
                           最后编辑于 {{ dayjs(data.updatedAt).format('YYYY-MM-DD HH:mm') }}
                        </span>
                     </StSpace>
                     <h1
                        class="st-font-secondary-bold leading-tight text-accent-100 line-clamp-2 break-words max-md:text-[1.375rem]">
                        {{ data.title }}
                     </h1>
                  </StSpace>
               </StSpace>

               <StSpace align="center" gap="0.75rem" class="shrink-0 max-md:w-full">
                  <StButton
                     v-if="isPublished"
                     bordered
                     theme="secondary"
                     class="py-[0.375rem] px-[1rem] !rounded-[0.625rem] max-md:flex-1"
                     @click="navigateTo(`/app/learning/${data.id}`)">
                     <div class="flex gap-2 items-center">
                        <PreviewOpen class="text-[1.25rem]" />
                        <span>查看课程页</span>
                     </div>
                  </StButton>
                  <StButton
                     v-if="isPublished"
                     bordered
                     theme="danger"
                     :loading="switchingStatus"
                     class="py-[0.375rem] px-[1rem] !rounded-[0.625rem] max-md:flex-1"
                     @click="togglePublish">
                     <div class="flex gap-2 items-center">
                        <Back class="text-[1.25rem]" />
                        <span>下架</span>
                     </div>
                  </StButton>
                  <StButton
                     v-else
                     :loading="switchingStatus"
                     :disabled="!canPublish"
                     :title="canPublish ? '' : '请先完善发布检查中的问题'"
                     class="py-[0.5rem] px-[1.375rem] text-accent-100 !rounded-[0.625rem] max-md:flex-1"
                     @click="togglePublish">
                     <div class="flex gap-2 items-center">
                        <UploadTwo class="text-[1.375rem]" />
                        <span>{{ data.status === 'unpublished' ? '重新发布' : '发布课程' }}</span>
                     </div>
                  </StButton>
               </StSpace>
            </StSpace>

            <CloudFunctionStatsGrid :items="stats" numeric-font />

            <CoursePublishChecklist :issues="issues" :status="data.status" />

            <StTabs v-model="activeTab" :options="tabs" />

            <!-- 课程大纲 -->
            <section v-show="activeTab === 'outline'" class="w-full">
               <StSpace justify="between" align="center" gap="1rem" class="mb-4 w-full max-md:mb-3">
                  <StSpace align="center" gap="0.625rem" class="min-w-0">
                     <ListTwo class="text-[1.375rem] text-accent-200" />
                     <h2 class="st-font-third-bold text-white">课程大纲</h2>
                     <span class="st-font-caption text-accent-400 max-md:hidden">
                        章节 → 阶段 → 小节，完成一个阶段的全部小节后解锁下一阶段
                     </span>
                  </StSpace>
                  <StButton
                     v-if="data.chapters.length"
                     class="py-[0.375rem] px-[1rem] text-accent-100 !rounded-[0.5rem] shrink-0"
                     @click="openChapterDrawer()">
                     <div class="flex gap-1.5 items-center">
                        <Plus class="text-[1.125rem]" />
                        <span>添加章节</span>
                     </div>
                  </StButton>
               </StSpace>

               <StSpace v-if="data.chapters.length" direction="vertical" gap="0.875rem" fill-x>
                  <OutlineChapter
                     v-for="(chapter, index) in data.chapters"
                     :key="chapter.id"
                     :chapter="chapter"
                     :index="index"
                     :total="data.chapters.length"
                     :busy-id="busyId"
                     :issue-section-ids="issueSectionIds"
                     :has-issue="issueChapterIds.has(chapter.id)"
                     @move="move"
                     @edit-chapter="openChapterDrawer(chapter)"
                     @remove-chapter="removeChapter(chapter)"
                     @add-stage="addStage(chapter)"
                     @remove-stage="removeStage"
                     @add-section="(stageId, location) => openSectionDrawer(stageId, location)"
                     @edit-section="openSectionDrawer"
                     @remove-section="removeSection" />
               </StSpace>

               <button
                  v-else
                  type="button"
                  class="group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-accent-500 py-14 px-6 text-center text-accent-300 transition-colors hover:border-primary/60 hover:text-primary cursor-pointer max-md:py-10"
                  @click="openChapterDrawer()">
                  <span
                     class="flex size-14 items-center justify-center rounded-2xl bg-accent-600 transition-colors group-hover:bg-primary/15">
                     <Plus size="1.75rem" />
                  </span>
                  <span class="st-font-body-bold">添加第一个章节</span>
                  <span class="st-font-caption text-accent-400">每个章节包含若干学习阶段，阶段中放置图文或实践题小节</span>
               </button>

               <p
                  v-if="data.chapters.length && !sectionCount"
                  class="mt-4 text-center st-font-caption text-accent-400">
                  点击阶段中的「添加小节」开始填充课程内容
               </p>
            </section>

            <!-- 基本信息 -->
            <StSpace v-show="activeTab === 'info'" direction="vertical" gap="2rem" fill-x class="max-md:!gap-4">
               <section class="w-full rounded-2xl border border-accent-500 p-6 max-md:p-4">
                  <StSpace align="center" gap="0.625rem" class="mb-5">
                     <SettingTwo class="text-[1.375rem] text-accent-200" />
                     <h2 class="st-font-third-bold text-white">基本信息</h2>
                  </StSpace>
                  <StForm ref="info-form" v-model:model-value="info" :rules="infoRules" class="w-full">
                     <StSpace direction="vertical" gap="1.5rem" fill-x>
                        <CourseInfoFields v-model:formdata="info" />
                     </StSpace>
                  </StForm>
                  <StSpace justify="end" align="center" gap="1rem" class="mt-6 w-full max-md:mt-5 max-md:flex-col-reverse max-md:!items-stretch max-md:!gap-2">
                     <span v-if="infoDirty" class="st-font-caption text-warning max-md:text-center">有未保存的修改</span>
                     <StButton
                        :loading="savingInfo"
                        :disabled="!infoDirty"
                        class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.5rem] max-md:!py-2.5"
                        @click="handleSaveInfo">
                        <div class="flex gap-2 items-center">
                           <Save class="text-[1.25rem]" />
                           <span>保存</span>
                        </div>
                     </StButton>
                  </StSpace>
               </section>

               <section
                  class="flex w-full items-center justify-between gap-4 rounded-2xl border border-error/40 p-6 max-md:flex-col max-md:items-start max-md:gap-3 max-md:p-4">
                  <StSpace direction="vertical" gap="0.25rem">
                     <span class="st-font-body-bold text-error">删除课程</span>
                     <span class="st-font-caption text-accent-400">
                        连同全部章节、小节与学员学习记录一并删除，不可撤销；仅需暂停学习时请使用「下架」
                     </span>
                  </StSpace>
                  <StButton
                     bordered
                     theme="danger"
                     class="py-[0.375rem] px-[1rem] shrink-0 max-md:w-full max-md:!py-2.5"
                     @click="removeCourse">
                     <div class="flex gap-2 items-center">
                        <Delete class="text-[1.25rem]" />
                        <span>删除</span>
                     </div>
                  </StButton>
               </section>
            </StSpace>
         </template>

         <StEmptyStatus
            v-else
            :icon="BookOpen"
            content="课程不存在或已被删除"
            class="min-h-[20rem]" />
      </StSpace>

      <ChapterEditingDrawer
         v-model:opened="chapterDrawer.opened"
         :course-id="courseId"
         :chapter="chapterDrawer.chapter"
         @saved="handleDrawerSaved" />
      <SectionEditingDrawer
         v-model:opened="sectionDrawer.opened"
         :stage-id="sectionDrawer.stageId"
         :location="sectionDrawer.location"
         :section="sectionDrawer.section"
         @saved="handleDrawerSaved" />
   </StSpace>
</template>
