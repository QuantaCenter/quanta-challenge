<script setup lang="ts">
import { Time } from '@icon-park/vue-next';
import { useIntervalFn } from '@vueuse/core';
import dayjs from 'dayjs';
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';
import { logger } from '~~/lib/logger';

useSeoMeta({ title: '定时任务 - Quanta Challenge' });

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const tabs: { label: string; value: string; color: string }[] = [
   { label: '重置题目', value: 'reset-problem', color: '#F97316' },
];
const activeTab = ref('reset-problem');

const { $trpc } = useNuxtApp();
const message = useMessage();

// ---- 重置题目表单 ----

const formdata = reactive({
   userNames: [] as string[],
   problemIds: [] as number[],
   runAt: '',
});

// 可选时间下限：每秒刷新，选择过程中也实时跟进当前时间
const minDateTime = ref(dayjs().format('YYYY-MM-DD HH:mm'));
useIntervalFn(() => {
   minDateTime.value = dayjs().format('YYYY-MM-DD HH:mm');
   // 已选时间若落入了禁选范围，自动修正为当前最早可选时间
   if (formdata.runAt && formdata.runAt < minDateTime.value) {
      formdata.runAt = minDateTime.value;
   }
}, 1_000);

const runAtDate = computed(() => {
   if (!formdata.runAt) return null;
   const date = dayjs(formdata.runAt.replace(' ', 'T'));
   return date.isValid() ? date : null;
});

const rules: IRule[] = [
   {
      field: 'userNames',
      required: true,
      validator: (value) => value.length > 0,
   },
   {
      field: 'problemIds',
      required: true,
      validator: (value) => value.length > 0,
   },
   {
      field: 'runAt',
      required: true,
      validator: (value) => {
         if (!value) return false;
         const date = dayjs(value.replace(' ', 'T'));
         return date.isValid() && date.isAfter(dayjs().subtract(1, 'minute'));
      },
   },
];

const form = useTemplateRef<InstanceType<typeof StForm>>('form');
const creating = ref(false);

const handleCreate = async () => {
   if (!form.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error('表单填写有误', `请检查 ${invalidField} 项`);
      return;
   }

   const runAt = runAtDate.value!;
   const confirmed = await dialog.confirm({
      title: '创建重置任务',
      description: `将在 ${runAt.format('YYYY-MM-DD HH:mm:ss')} 重置 ${formdata.userNames.length} 位用户在 ${formdata.problemIds.length} 道题目的做题记录与作答项目，并全量重算其得分，操作无法撤回。`,
      variant: 'danger',
      confirmText: '创建任务',
      cancelText: '取消',
   });
   if (!confirmed) return;

   creating.value = true;
   try {
      await $trpc.admin.scheduledTask.createResetTask.mutate({
         userNames: formdata.userNames,
         problemIds: formdata.problemIds,
         runAt: runAt.toDate(),
      });
      message.success('创建成功', '任务已进入队列，到期后自动执行');
      formdata.userNames = [];
      formdata.problemIds = [];
      formdata.runAt = '';
   } catch (error) {
      logger.error(error, '创建重置任务失败');
      message.error(
         '创建失败',
         error instanceof Error ? error.message : '请稍后重试',
      );
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
         <h1 class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">定时任务</h1>

         <!-- 仅一种任务类型时隐藏切换，后续增加任务类型后自动展示 -->
         <StSlideRadioGroup
            v-if="tabs.length > 1"
            :options="tabs"
            v-model:value="activeTab"
            class="px-[0.625rem]" />

         <StForm
            v-if="activeTab === 'reset-problem'"
            ref="form"
            v-model:model-value="formdata"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem] max-md:gap-4!">
               <StFormItem name="userNames" label="重置用户" required>
                  <template #default="{ status }">
                     <StUserPicker
                        v-model:value="formdata.userNames"
                        placeholder="输入用户名或昵称搜索，点选添加"
                        :max="500"
                        :status
                        :outer-class />
                     <span class="st-font-caption text-accent-300 mt-2 block">
                        为被严重警告扣除分数的用户重置题目，允许其重新答题并重新获取分数。
                     </span>
                  </template>
               </StFormItem>

               <StFormItem name="problemIds" label="选择题目" required>
                  <template #default="{ status }">
                     <StProblemPicker
                        v-model:value="formdata.problemIds"
                        placeholder="输入题目标题搜索已发布题目"
                        :max="200"
                        :status
                        :outer-class />
                  </template>
               </StFormItem>

               <StFormItem name="runAt" label="重置时间" required>
                  <template #default="{ status }">
                     <StDatePicker
                        v-model:value="formdata.runAt"
                        show-time
                        placeholder="选择重置日期与时间"
                        :min-date-time="minDateTime"
                        :status
                        :outer-class />
                     <span class="st-font-caption text-accent-300 mt-2 block">
                        任务到期后重置上述用户的做题记录与作答项目，并拉取剩余全量成功记录完整重算得分。
                     </span>
                  </template>
               </StFormItem>

               <StSpace justify="end" align="center" fill-x class="px-2">
                  <StButton
                     :loading="creating"
                     theme="danger"
                     @click="handleCreate"
                     class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
                     <div class="flex gap-2 items-center">
                        <Time class="text-[1.25rem]" />
                        <span>创建重置任务</span>
                     </div>
                  </StButton>
               </StSpace>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
