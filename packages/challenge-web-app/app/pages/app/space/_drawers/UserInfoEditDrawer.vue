<script setup lang="ts">
import type { IRule } from '~/components/st/Form/type';
import type { StForm } from '#components';
import { SaveOne } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

const opened = defineModel<boolean>('opened', { default: false });

const emits = defineEmits(['updated']);

const outerClass = 'border !py-4 !px-4 !rounded-[0.5rem] w-full';

const { $trpc } = useNuxtApp();

const formdata = reactive({
   bio: '',
   email: '',
   major: '',
   identifier: '',
   birthday: '',
   bannerImageId: '',
   avatarImageId: '',
});

// 当前已保存的头像/背景图地址，用于回显图片
const avatarImageUrl = ref('');
const bannerImageUrl = ref('');

const rules: IRule[] = [
   {
      field: 'email',
      validator(value) {
         if (!value) return true;
         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
         return emailRegex.test(value as string);
      },
   },
];

const form = useTemplateRef<InstanceType<typeof StForm>>('form');

// 加载用户信息
const loadUserInfo = async () => {
   try {
      const data = await $trpc.protected.user.getUserInfo.query();
      if (data) {
         formdata.bio = data.bio || '';
         formdata.email = data.email || '';
         formdata.major = data.major || '';
         formdata.identifier = data.identifier || '';
         if (data.birthday) {
            const dateStr = new Date(data.birthday).toISOString().split('T')[0];
            formdata.birthday = dateStr!;
         } else {
            formdata.birthday = '';
         }
         formdata.bannerImageId = data.bannerImageId || '';
         formdata.avatarImageId = data.avatarImageId || '';
         bannerImageUrl.value = data.bannerImageUrl || '';
         avatarImageUrl.value = data.avatarUrl || '';
      }
   } catch (e) {
      console.error('加载用户信息失败:', e);
   }
};

// 当 drawer 打开时加载用户信息
watch(opened, async (isOpened) => {
   if (isOpened) {
      await loadUserInfo();
   }
});

const loading = ref(false);

const message = useMessage();

const handleUpdate = async () => {
   if (!form.value?.validate().success) return;

   const updateUserInfo = async () => {
      await $trpc.protected.user.updateUserInfo.mutate({
         bio: formdata.bio || undefined,
         email: formdata.email || undefined,
         major: formdata.major || undefined,
         identifier: formdata.identifier || undefined,
         birthday: formdata.birthday || undefined,
         bannerImageId: formdata.bannerImageId || undefined,
         avatarImageId: formdata.avatarImageId || undefined,
      });
   };

   loading.value = true;
   await atLeastTime(200, updateUserInfo())
      .then(() => {
         opened.value = false;
         emits('updated');
         message.success('用户信息更新成功');
      })
      .catch((e) => {
         console.error('更新用户信息失败:', e);
         message.error('更新用户信息失败');
      })
      .finally(() => {
         loading.value = false;
      });
};

const enableSubmit = computed(() => {
   return form.value?.validate().success && !loading.value;
});
</script>

<template>
   <StDrawer global v-model:opened="opened" width="35rem">
      <StSpace direction="vertical" gap="0" fill class="text-white">
         <StSpace direction="vertical" gap="1.5rem" fill class="p-6">
            <!-- Header -->
            <h1 class="st-font-secondary-bold">编辑个人资料</h1>
            <StSpace fill class="relative overflow-auto">
               <StForm
                  ref="form"
                  v-model:model-value="formdata"
                  :rules="rules"
                  class="w-full absolute top-0 left-0">
                  <StSpace direction="vertical" gap="1.5rem" fill-x>
                     <StFormItem name="avatarImageId" label="头像">
                        <StUploadImage
                           v-model:image-id="formdata.avatarImageId"
                           v-model:image-url="avatarImageUrl"
                           class="bg-black !max-h-[12rem]"
                           image-max-height="8rem"
                           placeholder="请选择头像"
                           aspect-ratio="1/1"
                           upload-level="USER" />
                     </StFormItem>
                     <StFormItem name="bio" label="个性签名">
                        <StTextarea
                           v-model:value="formdata.bio"
                           placeholder="请输入个性签名"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="email" label="邮箱">
                        <StInput
                           v-model:value="formdata.email"
                           placeholder="请输入邮箱地址"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="major" label="学院">
                        <StInput
                           v-model:value="formdata.major"
                           placeholder="请输入学院"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="identifier" label="身份">
                        <StInput
                           v-model:value="formdata.identifier"
                           placeholder="请输入身份"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="birthday" label="生日">
                        <StDatePicker
                           v-model:value="formdata.birthday"
                           placeholder="请选择生日"
                           :outer-class />
                     </StFormItem>
                     <StFormItem name="bannerImageId" label="背景图">
                        <StUploadImage
                           v-model:image-id="formdata.bannerImageId"
                           v-model:image-url="bannerImageUrl"
                           class="bg-black !max-h-[12rem]"
                           image-max-height="8rem"
                           placeholder="请选择背景图"
                           upload-level="USER" />
                     </StFormItem>
                  </StSpace>
               </StForm>
            </StSpace>
         </StSpace>
         <!-- Bottom -->
         <StSpace justify="end" class="p-4 pt-0 w-full">
            <StButton
               @click="handleUpdate"
               :loading="loading"
               :disabled="!enableSubmit"
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.375rem]">
               <div class="flex gap-2 items-center">
                  <SaveOne class="text-[1.5rem]" />
                  <span>保存</span>
               </div>
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
