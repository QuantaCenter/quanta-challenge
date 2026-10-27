<script setup lang="ts">
import { Message } from '@icon-park/vue-next';
import Section from './_components/Section.vue';
import Binary from './_components/Binary.vue';
import { useNuxtApp } from '#app';
import { useMessage } from '~/components/st/Message/use-message';
import { UserSettingsKeys } from '~/configs/user_settings';

useSeoMeta({ title: '常规设置 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const message = useMessage();

// 邮件 / 浏览器推送暂未接入后端，仅本地展示
const notifications = ref({
   email: true,
   browser: false,
});

// 判题结果通知（默认关闭，持久化到用户设置）
const judgeResultNotify = ref(false);
const savingJudgeResultNotify = ref(false);

const loadSettings = async () => {
   try {
      const settings = await $trpc.protected.setting.get.query();
      judgeResultNotify.value =
         settings[UserSettingsKeys.JUDGE_RESULT_NOTIFY] === 'true';
   } catch (error) {
      console.error('Failed to load user settings:', error);
   }
};

const updateJudgeResultNotify = async (value: boolean) => {
   if (savingJudgeResultNotify.value) return;
   savingJudgeResultNotify.value = true;
   try {
      await $trpc.protected.setting.upsert.mutate({
         key: UserSettingsKeys.JUDGE_RESULT_NOTIFY,
         value: String(value),
      });
      message.success('设置成功', value ? '已开启判题结果通知' : '已关闭判题结果通知');
   } catch (error) {
      console.error('Failed to update user setting:', error);
      judgeResultNotify.value = !value;
      message.error('设置失败', '判题结果通知设置保存失败，请稍后重试');
   } finally {
      savingJudgeResultNotify.value = false;
   }
};

onMounted(loadSettings);
</script>

<template>
   <StSpace fill-x direction="vertical" gap="1rem">
      <Section
         title="通知设置"
         desc="管理您接收通知的方式和内容，不错过重要信息。"
         :icon="Message">
         <Binary v-model="notifications.email">接收重要通知邮件</Binary>
         <Binary v-model="notifications.browser">浏览器推送通知</Binary>
         <Binary
            v-model="judgeResultNotify"
            @update:model-value="updateJudgeResultNotify">
            判题结果通知
         </Binary>
      </Section>
   </StSpace>
</template>
