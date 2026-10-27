<script setup lang="ts">
import { GoldMedalTwo, UploadTwo } from '@icon-park/vue-next';
import { useAchievementPublicationForm } from './_composables/use-achievement-publication-form';
import DependencyDataPicker from './_modules/DependencyDataPicker.vue';
import CheckScript from './_modules/CheckScript.vue';
import { type IDataLoader } from './_utils/dts-file-parser';
import { useMessage } from '~/components/st/Message/use-message';
import PreAchievementsPicker, {
   type IAchievement,
} from './_modules/PreAchievementsPicker.vue';

useSeoMeta({ title: '创建成就 - Quanta Challenge' });

const outerClass =
   'border !py-4 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';

const { form, formKey, formdata, rules } = useAchievementPublicationForm();

const pickedDataLoader = ref<IDataLoader[]>([]);
const pickedPreAchievements = ref<IAchievement[]>([]);

const { $trpc } = useNuxtApp();
const message = useMessage();
const createLoading = ref(false);
const handleCreate = async () => {
   if (!form.value) return;

   const { success, invalidField } = form.value.validate();
   if (!success) {
      message.error(`表单填写有误`, `请检查 ${invalidField} 项`);
      return;
   }

   try {
      createLoading.value = true;
      await $trpc.admin.achievement.createAchievement.mutate({
         name: formdata.name,
         description: formdata.description,
         imageId: formdata.imageId,
         dependencyData: formdata.dependencyData,
         preAchievements: formdata.preAchievements,
         script: formdata.script,
         isCheckinAchievement: formdata.isCheckinAchievement,
         score: formdata.score,
      });
      message.success('成就创建成功');
      navigateTo('/app/publish');
   } catch (err: any) {
      message.error('成就创建失败，请稍后重试', err.message);
   } finally {
      createLoading.value = false;
   }
};
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[44rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <h1
            class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
            创建成就
         </h1>
         <StForm
            v-model:model-value="formdata"
            :ref="formKey"
            :rules="rules"
            class="w-full">
            <StSpace
               direction="vertical"
               gap="1.75rem"
               class="w-full px-[0.625rem] max-md:gap-4!">
               <StFormItem name="title" label="成就名称" required>
                  <StInput
                     v-model:value="formdata.name"
                     placeholder="请输入2～15字的成就名称"
                     name="title"
                     :outer-class />
               </StFormItem>
               <StFormItem name="description" label="成就描述" required>
                  <StInput
                     v-model:value="formdata.description"
                     placeholder="请输入1～20字的成就描述"
                     name="description"
                     :outer-class />
               </StFormItem>
               <StFormItem name=" score" label="成就分" required>
                  <StInput
                     type="number"
                     v-model:value="formdata.score"
                     placeholder="请输入成就分"
                     name="score"
                     :outer-class />
               </StFormItem>
               <StFormItem name="requiredData" label="成就依赖数据" required>
                  <DependencyDataPicker
                     v-model:picked-data-loaders="pickedDataLoader"
                     v-model:dependency-data="formdata.dependencyData"
                     :outer-class />
               </StFormItem>
               <StFormItem name="requiredData" label="前置成就" required>
                  <PreAchievementsPicker
                     v-model:picked-achievements="pickedPreAchievements"
                     v-model:pre-achievements="formdata.preAchievements"
                     :outer-class />
               </StFormItem>
               <StFormItem name="checkScript" label="成就检测脚本" required>
                  <CheckScript
                     v-model:script="formdata.script"
                     :picked-data-loaders="pickedDataLoader" />
               </StFormItem>
               <StFormItem
                  name="isCheckinAchievement"
                  label="是否为签到成就"
                  required>
                  <StSlideRadioGroup
                     v-model:value="formdata.isCheckinAchievement"
                     :options="[
                        { label: '否', value: false, color: '#FA7C0E' },
                        { label: '是', value: true, color: '#a6fb1d' },
                     ]" />
               </StFormItem>
               <StFormItem name="icon" label="成就图标" required>
                  <StUploadImage
                     v-model:image-id="formdata.imageId"
                     :icon="GoldMedalTwo"
                     placeholder="请上传成就徽章图片" />
               </StFormItem>
            </StSpace>
            <StSpace justify="between" align="center" class="px-2 mt-[2.13rem]">
               <div class="text-accent-300">已经自动保存</div>
               <StButton
                  :loading="createLoading"
                  @click="handleCreate"
                  class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
                  <div class="flex gap-2 items-center">
                     <UploadTwo class="text-[1.5rem]" />
                     <span>创建成就</span>
                  </div>
               </StButton>
            </StSpace>
         </StForm>
      </StSpace>
   </StSpace>
</template>
