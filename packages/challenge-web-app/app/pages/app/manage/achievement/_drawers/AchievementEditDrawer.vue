<script setup lang="ts">
import { GoldMedalTwo } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import PreAchievementsPicker from '../../../publish/achievement/_modules/PreAchievementsPicker.vue';

const props = defineProps<{ achievementId: number }>();
const opened = defineModel<boolean>('opened', { default: false });
const emit = defineEmits<{ saved: [] }>();
const { $trpc } = useNuxtApp();
const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const loaded = ref(false);
const imageUrl = ref('');
const form = reactive({ name: '', description: '', imageId: '', preAchievements: [] as number[] });
const outerClass = 'border !py-3 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary';
let requestId = 0;

watch(opened, async (isOpen) => {
   const request = ++requestId;
   if (!isOpen) return;
   loaded.value = false;
   loading.value = true;
   try {
      const detail = await $trpc.admin.achievement.getAchievementDetail.query({ id: props.achievementId });
      if (request !== requestId) return;
      if (!detail.canEdit) {
         message.error('没有权限编辑此成就');
         opened.value = false;
         return;
      }
      Object.assign(form, {
         name: detail.name,
         description: detail.description ?? '',
         imageId: detail.imageId,
         preAchievements: detail.preAchievements.map((item) => item.id),
      });
      imageUrl.value = detail.badgeUrl;
      loaded.value = true;
   } catch (error) {
      if (request === requestId) message.error('加载成就失败', (error as Error).message);
   } finally {
      if (request === requestId) loading.value = false;
   }
}, { immediate: true });

const submit = async () => {
   if (saving.value || !loaded.value) return;
   const name = form.name.trim();
   const description = form.description.trim();
   if (!name || name.length > 50 || !description || description.length > 255 || !form.imageId) {
      message.error('请检查基本信息', '名称需为1～50字，描述需为1～255字，并上传成就图标');
      return;
   }
   saving.value = true;
   try {
      await $trpc.admin.achievement.updateAchievement.mutate({
         id: props.achievementId,
         name,
         description,
         imageId: form.imageId,
         preAchievements: [...form.preAchievements],
      });
      message.success('成就更新成功');
      opened.value = false;
      emit('saved');
   } catch (error) {
      message.error('成就更新失败', (error as Error).message);
   } finally {
      saving.value = false;
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="34rem">
      <StSpace direction="vertical" gap="0" class="h-full text-white pt-4 md:pt-0" fill>
         <div class="w-full flex-1 min-h-0 overflow-auto p-6">
            <h2 class="st-font-secondary-bold max-md:text-[1.25rem]">编辑成就</h2>
            <p class="st-font-caption text-accent-300 mt-2 mb-6">
               可编辑名称、图标、描述及前置成就。
            </p>
            <div v-if="loading" class="text-accent-300 py-12 text-center">加载中…</div>
            <StSpace v-else-if="loaded" direction="vertical" gap="1.5rem" class="w-full">
               <StFormItem name="name" label="成就名称" required>
                  <StInput v-model:value="form.name" placeholder="请输入1～50字的成就名称" :outer-class />
               </StFormItem>
               <StFormItem name="description" label="成就描述" required>
                  <StInput v-model:value="form.description" placeholder="请输入1～255字的成就描述" :outer-class />
               </StFormItem>
               <StFormItem name="imageId" label="成就图标" required>
                  <StUploadImage
                     v-model:image-id="form.imageId"
                     v-model:image-url="imageUrl"
                     :icon="GoldMedalTwo"
                     placeholder="请上传成就徽章图片" />
               </StFormItem>
               <StFormItem name="preAchievements" label="前置成就">
                  <PreAchievementsPicker
                     v-model:pre-achievements="form.preAchievements"
                     :exclude-ids="[props.achievementId]"
                     :outer-class />
               </StFormItem>
            </StSpace>
            <div v-else class="text-accent-300 py-12 text-center">加载失败，请关闭后重试</div>
         </div>
         <StSpace justify="end" gap="0.75rem" class="w-full border-t border-accent-600 p-4">
            <StButton bordered @click="opened = false">取消</StButton>
            <StButton :loading="saving" :disabled="loading || !loaded || !form.imageId" @click="submit">保存修改</StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
