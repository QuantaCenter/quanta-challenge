<script setup lang="ts">
import { Send } from '@icon-park/vue-next';
import { useIntervalFn } from '@vueuse/core';
import dayjs from 'dayjs';
import LazyMarkdownEditingDrawer from '../_drawers/MarkdownEditingDrawer.vue';
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { useMessage } from '~/components/st/Message/use-message';
import { dialog } from '~/composables/use-dialog';
import { logger } from '~~/lib/logger';

useSeoMeta({ title: '发送通知 - Quanta Challenge' });

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const typeOptions = [
   { label: '日常公告', value: 'ANNOUNCEMENT', color: '#8B5CF6' },
   { label: '严重警告', value: 'WARNING', color: '#EF4444' },
];

const scopeOptions = [
   { label: '全体用户', value: 'ALL', color: '#FA7C0E' },
   { label: '指定用户', value: 'USERS', color: '#38BDF8' },
];

const sendTimeOptions = [
   { label: '立即发送', value: 'NOW', color: '#FA7C0E' },
   { label: '定时发送', value: 'SCHEDULED', color: '#38BDF8' },
];

const { $trpc } = useNuxtApp();
const message = useMessage();

const formdata = reactive({
   type: 'ANNOUNCEMENT' as 'ANNOUNCEMENT' | 'WARNING',
   scope: 'ALL' as 'ALL' | 'USERS',
   userNames: [] as string[],
   title: '',
   content: '',
   penaltyScore: 0 as string | number,
   sendTime: 'NOW' as 'NOW' | 'SCHEDULED',
   runAt: '',
});

// 定时发送的可选时间下限：每秒刷新，保证不早于当前时间
const minDateTime = ref(dayjs().format('YYYY-MM-DD HH:mm'));
useIntervalFn(() => {
   minDateTime.value = dayjs().format('YYYY-MM-DD HH:mm');
   // 已选发送时间落入禁选范围时，自动修正为当前最早可选时间
   if (
      formdata.sendTime === 'SCHEDULED' &&
      formdata.runAt &&
      formdata.runAt < minDateTime.value
   ) {
      formdata.runAt = minDateTime.value;
   }
}, 1_000);

const runAtDate = computed(() => {
   if (formdata.sendTime !== 'SCHEDULED' || !formdata.runAt) return null;
   const date = dayjs(formdata.runAt.replace(' ', 'T'));
   return date.isValid() ? date : null;
});

const canPenalize = computed(
   () => formdata.type === 'WARNING' && formdata.scope === 'USERS',
);
const penaltyScore = computed(() =>
   canPenalize.value ? Number(formdata.penaltyScore) || 0 : 0,
);

const rules: IRule[] = [
   {
      field: 'title',
      required: true,
      validator: (value) => !!value?.trim(),
   },
   {
      field: 'content',
      required: true,
      validator: (value) => !!value?.trim(),
   },
   {
      field: 'userNames',
      validator: (value, data) => data.scope !== 'USERS' || value.length > 0,
   },
   {
      field: 'penaltyScore',
      validator: (value) => {
         if (!canPenalize.value) return true;
         const score = Number(value);
         return Number.isInteger(score) && score >= 0 && score <= 10000;
      },
   },
   {
      field: 'runAt',
      validator: (value, data) => {
         if (data.sendTime !== 'SCHEDULED') return true;
         if (!value) return false;
         const date = dayjs(String(value).replace(' ', 'T'));
         return date.isValid() && date.isAfter(dayjs());
      },
   },
];

const form = useTemplateRef<InstanceType<typeof StForm>>('form');
const sending = ref(false);

// 内容支持 Markdown 编辑
const markdownEditing = ref(false);

const handleSend = async () => {
   if (!form.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error('表单填写有误', `请检查 ${invalidField} 项`);
      return;
   }

   const typeLabel = formdata.type === 'WARNING' ? '严重警告' : '日常公告';
   const targetLabel =
      formdata.scope === 'ALL'
         ? '全体用户'
         : `${formdata.userNames.length} 位指定用户`;
   const penaltyLabel =
      penaltyScore.value > 0
         ? `，并扣除每人 ${penaltyScore.value} 分排行榜积分（申诉通过后恢复）`
         : '';
   const scheduled = formdata.sendTime === 'SCHEDULED';
   const timeLabel = scheduled && runAtDate.value
      ? `将于 ${runAtDate.value.format('YYYY-MM-DD HH:mm')} `
      : '将';
   const confirmed = await dialog.confirm({
      title: scheduled ? `定时发送${typeLabel}` : `发送${typeLabel}`,
      description: `${timeLabel}向${targetLabel}发送「${formdata.title.trim()}」${penaltyLabel}，发送后无法撤回。`,
      variant: formdata.type === 'WARNING' ? 'danger' : 'default',
      confirmText: scheduled ? '定时发送' : '发送',
      cancelText: '取消',
   });
   if (!confirmed) return;

   sending.value = true;
   try {
      if (scheduled) {
         await $trpc.admin.notification.scheduledSend.mutate({
            type: formdata.type,
            title: formdata.title,
            content: formdata.content,
            target:
               formdata.scope === 'ALL'
                  ? { scope: 'ALL' }
                  : { scope: 'USERS', userNames: formdata.userNames },
            penaltyScore: penaltyScore.value,
            runAt: runAtDate.value!.toDate(),
         });
         message.success(
            '已加入定时队列',
            `将于 ${runAtDate.value!.format('YYYY-MM-DD HH:mm')} 自动发送`,
         );
      } else {
         const { count } = await $trpc.admin.notification.send.mutate({
            type: formdata.type,
            title: formdata.title,
            content: formdata.content,
            target:
               formdata.scope === 'ALL'
                  ? { scope: 'ALL' }
                  : { scope: 'USERS', userNames: formdata.userNames },
            penaltyScore: penaltyScore.value,
         });
         message.success('发送成功', `已发送给 ${count} 位用户`);
      }
      formdata.title = '';
      formdata.content = '';
      formdata.userNames = [];
      formdata.penaltyScore = 0;
      formdata.sendTime = 'NOW';
      formdata.runAt = '';
   } catch (error) {
      logger.error(error, '发送通知失败');
      message.error(
         '发送失败',
         error instanceof Error ? error.message : '请稍后重试',
      );
   } finally {
      sending.value = false;
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">发送通知</h1>
         <StForm
            ref="form"
            v-model:model-value="formdata"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem]">
               <StFormItem name="type" label="通知类型" required>
                  <StSpace direction="vertical" gap="0.5rem" fill-x>
                     <StSlideRadioGroup
                        :options="typeOptions"
                        v-model:value="formdata.type" />
                     <span
                        v-if="formdata.type === 'WARNING'"
                        class="st-font-caption text-error">
                        严重警告会在接收者阅读前，于页面右下角持续展示且无法关闭。
                     </span>
                  </StSpace>
               </StFormItem>
               <StFormItem name="scope" label="接收对象" required>
                  <StSlideRadioGroup
                     :options="scopeOptions"
                     v-model:value="formdata.scope" />
               </StFormItem>
               <StFormItem
                  v-if="formdata.scope === 'USERS'"
                  name="userNames"
                  label="接收用户"
                  required>
                  <template #default="{ status }">
                     <StUserPicker
                        v-model:value="formdata.userNames"
                        placeholder="输入用户名或昵称搜索，点选添加"
                        :max="500"
                        :status
                        :outer-class />
                  </template>
               </StFormItem>
               <StFormItem
                  v-if="canPenalize"
                  name="penaltyScore"
                  label="扣除分数">
                  <StSpace direction="vertical" gap="0.5rem" fill-x>
                     <StInput
                        v-model:value="formdata.penaltyScore"
                        type="number"
                        min="0"
                        max="10000"
                        placeholder="0 表示不扣分"
                        name="penaltyScore"
                        :outer-class />
                     <span class="st-font-caption text-accent-300">
                        从每位接收者的排行榜积分中扣除（最低扣到 0），申诉通过后自动恢复。
                     </span>
                  </StSpace>
               </StFormItem>
                <StFormItem name="sendTime" label="发送时机" required>
                  <StSlideRadioGroup
                     :options="sendTimeOptions"
                     v-model:value="formdata.sendTime" />
               </StFormItem>
               <StFormItem
                  v-if="formdata.sendTime === 'SCHEDULED'"
                  name="runAt"
                  label="发送时间"
                  required>
                  <template #default="{ status }">
                     <StDatePicker
                        v-model:value="formdata.runAt"
                        show-time
                        placeholder="选择发送日期与时间"
                        :min-date-time="minDateTime"
                        :status
                        :outer-class />
                     <span class="st-font-caption text-accent-300 mt-2 block">
                        通知将在到达指定时间后由系统自动发送，创建后可在定时任务管理中取消。
                     </span>
                  </template>
               </StFormItem>
               <StFormItem name="title" label="标题" required>
                  <StInput
                     v-model:value="formdata.title"
                     placeholder="请输入通知标题"
                     name="title"
                     maxlength="100"
                     :outer-class />
               </StFormItem>
               <StFormItem name="content" label="内容" required>
                  <template #header-right>
                     <LazyMarkdownEditingDrawer
                        hydrate-on-visible
                        v-model:opened="markdownEditing"
                        v-model:markdown="formdata.content"
                        drawer-title="编辑通知内容" />
                     <StTextButton
                        @click="markdownEditing = !markdownEditing"
                        text="使用 md 编辑器" />
                  </template>
                  <StTextarea
                     v-model:value="formdata.content"
                     placeholder="请输入通知内容"
                     rows="8"
                     maxlength="5000"
                     :outer-class />
               </StFormItem>
            </StSpace>
            <StSpace justify="end" align="center" class="px-2 mt-[2.13rem]">
               <StButton
                  :loading="sending"
                  :theme="formdata.type === 'WARNING' ? 'danger' : 'primary'"
                  @click="handleSend"
                  class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
                  <div class="flex gap-2 items-center">
                     <Send class="text-[1.25rem]" />
                     <span>发送通知</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
