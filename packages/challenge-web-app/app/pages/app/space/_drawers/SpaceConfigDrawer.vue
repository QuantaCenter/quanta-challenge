<script setup lang="ts">
import { Info, SaveOne } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import useAuthStore from '~/stores/auth-store';

const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits(['updated']);

const { $trpc } = useNuxtApp();
const message = useMessage();

interface PersonalInfoVisibility {
   birthday: boolean;
   email: boolean;
   identifier: boolean;
   major: boolean;
}

const formdata = reactive<{
   showSubmissionStatus: boolean;
   showAchievements: boolean;
   personalInfoVisibility: PersonalInfoVisibility;
}>({
   showSubmissionStatus: true,
   showAchievements: true,
   personalInfoVisibility: {
      birthday: true,
      email: true,
      identifier: true,
      major: true,
   },
});

// 加载空间配置
const loadSpaceConfig = async () => {
   try {
      const authStore = useAuthStore();
      if (!authStore.user?.name) return;

      const data = await $trpc.protected.user.getUserSpaceConfig.query({
         name: authStore.user.name,
      });

      if (data) {
         formdata.showSubmissionStatus = data.showSubmissionStatus;
         formdata.showAchievements = data.showAchievements;
         // 安全处理 JSON 字段
         const rawData: any = data;
         const rawVisibility = rawData.personalInfoVisibility;
         if (rawVisibility && typeof rawVisibility === 'object') {
            formdata.personalInfoVisibility = {
               birthday: rawVisibility.birthday === false ? false : true,
               email: rawVisibility.email === false ? false : true,
               identifier: rawVisibility.identifier === false ? false : true,
               major: rawVisibility.major === false ? false : true,
            };
         }
      }
   } catch (error) {
      console.error('加载空间配置失败:', error);
   }
};

// 保存配置
const handleSave = async () => {
   try {
      await $trpc.protected.user.updateUserSpaceConfig.mutate({
         showSubmissionStatus: formdata.showSubmissionStatus,
         showAchievements: formdata.showAchievements,
         personalInfoVisibility: formdata.personalInfoVisibility,
      });

      message.success('保存成功');
      emits('updated');
      opened.value = false;
   } catch (error) {
      console.error('保存失败:', error);
      message.error('保存失败，请重试');
   }
};

// 监听 drawer 打开，加载数据
watch(opened, (val) => {
   if (val) {
      loadSpaceConfig();
   }
});

const infoFieldLabels = {
   birthday: '生日',
   email: '邮箱',
   identifier: '身份',
   major: '学院',
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6">
            <!-- Header -->
            <h1 class="st-font-secondary-bold max-md:text-[1.25rem]">
               空间展示配置
            </h1>

            <StSpace fill class="relative overflow-auto">
               <StSpace
                  direction="vertical"
                  gap="1.5rem"
                  fill-x
                  class="w-full absolute top-0 left-0">
                  <!-- 模块可见性配置 -->
                  <StSpace fill-x direction="vertical" gap="0.75rem">
                     <div class="st-font-title-normal text-accent-200">
                        模块可见性
                     </div>

                     <StSpace fill-x direction="vertical" gap="0.5rem">
                        <StSpace
                           fill-x
                           align="center"
                           justify="between"
                           class="border border-accent-500 rounded-lg px-4 py-3 hover:border-accent-400 transition-colors">
                           <StSpace fill-x direction="vertical" gap="0.25rem">
                              <span class="st-font-body-normal">
                                 提交情况模块
                              </span>
                              <span
                                 class="st-font-small-normal text-accent-300">
                                 展示你的提交统计和通过情况
                              </span>
                           </StSpace>
                           <StSwitch v-model="formdata.showSubmissionStatus" />
                        </StSpace>

                        <StSpace
                           fill-x
                           align="center"
                           justify="between"
                           class="border border-accent-500 rounded-lg px-4 py-3 hover:border-accent-400 transition-colors">
                           <StSpace fill-x direction="vertical" gap="0.25rem">
                              <span class="st-font-body-normal">
                                 我的成就模块
                              </span>
                              <span
                                 class="st-font-small-normal text-accent-300">
                                 展示你获得的成就徽章
                              </span>
                           </StSpace>
                           <StSwitch v-model="formdata.showAchievements" />
                        </StSpace>
                     </StSpace>
                  </StSpace>

                  <!-- 个人信息字段可见性配置 -->
                  <StSpace fill-x direction="vertical" gap="0.75rem">
                     <div class="st-font-title-normal text-accent-200">
                        个人信息字段
                     </div>

                     <StSpace fill-x direction="vertical" gap="0.5rem">
                        <StSpace
                           fill-x
                           v-for="(label, key) in infoFieldLabels"
                           :key="key"
                           align="center"
                           justify="between"
                           class="border border-accent-500 rounded-lg px-4 py-3 hover:border-accent-400 transition-colors">
                           <span class="st-font-body-normal">{{ label }}</span>
                           <StSwitch
                              v-model="formdata.personalInfoVisibility[key]" />
                        </StSpace>
                     </StSpace>
                  </StSpace>

                  <!-- 说明文字 -->
                  <StSpace
                     fill-x
                     direction="vertical"
                     gap="0.5rem"
                     class="border border-warning rounded-lg px-4 py-3 bg-warning/10">
                     <StSpace
                        align="center"
                        justify="start"
                        gap="0.5rem"
                        class="st-font-caption text-warning">
                        <Info size="1rem" />
                        这些配置仅对访客生效
                     </StSpace>
                  </StSpace>
               </StSpace>
            </StSpace>
         </StSpace>

         <!-- Bottom Action -->
         <StSpace justify="end" class="p-4 pt-0 w-full">
            <StButton
               @click="handleSave"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
               <div class="flex gap-2 items-center">
                  <SaveOne class="text-[1.5rem]" />
                  <span>保存配置</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
