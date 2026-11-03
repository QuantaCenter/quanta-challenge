<script setup lang="ts">
import { ArrowLeft, UploadTwo } from '@icon-park/vue-next';
import type { StForm } from '#components';
import type { IRule } from '~/components/st/Form/type';
import { useMessage } from '~/components/st/Message/use-message';
import CourseInfoFields from '~/components/course-admin/CourseInfoFields.vue';
import type { ICourseInfoForm } from '~/types/course-admin';

useSeoMeta({ title: '发布课程 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const message = useMessage();

const emptyDraft = (): ICourseInfoForm => ({
   title: '',
   summary: '',
   description: '',
   coverImageId: '',
   coverImageUrl: '',
});

/** 未提交的内容自动保存在本地，刷新或误关页面不丢失 */
const formdata = useLocalStorage<ICourseInfoForm>('course-publication-draft', emptyDraft(), {
   mergeDefaults: true,
});

const rules: IRule[] = [
   {
      field: 'title',
      required: true,
      validator: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 50,
   },
   {
      field: 'summary',
      validator: (value) => (value ?? '').length <= 120,
   },
];

const form = useTemplateRef<InstanceType<typeof StForm>>('form');

const steps = [
   { title: '填写课程信息', description: '标题、简介、导读与封面' },
   { title: '编排课程大纲', description: '章节 → 阶段 → 小节' },
   { title: '检查并发布', description: '通过发布检查后上线' },
];

const creating = ref(false);
const handleCreate = async () => {
   if (!form.value) return;
   const { success } = form.value.validate();
   if (!success) {
      message.error('表单填写有误', '请填写 1～50 字的课程标题');
      return;
   }
   creating.value = true;
   try {
      const course = await $trpc.admin.course.create.mutate({
         title: formdata.value.title,
         summary: formdata.value.summary,
         description: formdata.value.description,
         coverImageId: formdata.value.coverImageId || null,
      });
      formdata.value = emptyDraft();
      message.success('课程已创建', '继续为课程添加章节与小节');
      await navigateTo(`/app/publish/course/${course.id}`);
   } catch (err) {
      message.error('课程创建失败', (err as Error)?.message ?? '请稍后重试');
   } finally {
      creating.value = false;
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[44rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <NuxtLink
            to="/app/publish"
            class="flex w-fit items-center gap-2 text-accent-300 transition-colors hover:text-white">
            <ArrowLeft class="text-[1.125rem]" />
            <span class="st-font-caption">返回发布流程</span>
         </NuxtLink>

         <StSpace direction="vertical" gap="0.5rem">
            <h1 class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
               发布课程
            </h1>
            <p class="st-font-body-normal text-accent-300 max-md:text-sm">
               先创建课程，再进入编排页添加章节与小节，检查无误后发布给学员。
            </p>
         </StSpace>

         <ol class="grid w-full grid-cols-3 gap-3 max-md:grid-cols-1 max-md:gap-2">
            <li
               v-for="(step, index) in steps"
               :key="step.title"
               class="flex items-center gap-3 rounded-xl border px-4 py-3"
               :class="
                  index === 0
                     ? 'border-primary/60 bg-primary/5'
                     : 'border-accent-500 text-accent-300'
               ">
               <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full st-font-caption font-bold"
                  :class="index === 0 ? 'bg-primary text-white' : 'bg-accent-600 text-accent-300'">
                  {{ index + 1 }}
               </span>
               <span class="flex min-w-0 flex-col">
                  <span
                     class="st-font-body-bold truncate"
                     :class="index === 0 ? 'text-white' : 'text-accent-200'">
                     {{ step.title }}
                  </span>
                  <span class="st-font-caption truncate text-accent-400">
                     {{ step.description }}
                  </span>
               </span>
            </li>
         </ol>

         <StForm
            ref="form"
            v-model:model-value="formdata"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem] max-md:px-0 max-md:gap-4!">
               <CourseInfoFields v-model:formdata="formdata" />
            </StSpace>
            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem] max-md:px-0">
               <div class="st-font-caption text-accent-300">已经自动保存</div>
               <StButton
                  :loading="creating"
                  class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]"
                  @click="handleCreate">
                  <div class="flex gap-2 items-center">
                     <UploadTwo class="text-[1.5rem]" />
                     <span>创建并编排大纲</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
