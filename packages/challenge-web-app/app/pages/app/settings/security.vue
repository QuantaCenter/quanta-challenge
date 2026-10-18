<script setup lang="tsx">
import { Mail, Fingerprint, Key } from '@icon-park/vue-next';
import { useRegisterAuthn } from './_composables/use-register-authn';
import Section from './_components/Section.vue';
import Divider from './_components/Divider.vue';
import Button from './_components/Button.vue';
import Input from './_components/Input.vue';
import { useMessage } from '~/components/st/Message/use-message';
import { useChangePassword } from './_composables/use-change-password';
import useAuthStore from '~/stores/auth-store';

useSeoMeta({ title: '安全设置 - Quanta Challenge' });

const message = useMessage();
const authStore = useAuthStore();

// Web Authn 注册相关
const authn = useRegisterAuthn();
const webauthnRegistered = useLocalStorage('webauthn-registered', 0);

authn.onRegisterSuccess(() => {
   message.success('注册成功', '您的新设备已成功注册，您可以使用它进行登录');
   webauthnRegistered.value = 1;
});
authn.onRegisterError((error: any) => {
   if (
      error instanceof Error &&
      error.message.includes('was previously registered')
   ) {
      // 设备已注册过了，提示用户但不视为错误
      message.success('注册成功', '您的新设备已成功注册，您可以使用它进行登录');
      webauthnRegistered.value = 1;
   } else {
      message.error('注册失败', '设备注册失败，请重试');
      webauthnRegistered.value = 0;
   }
});

// 密码修改相关
const changePassword = useChangePassword();

changePassword.onChangeSuccess(() => {
   message.success('修改成功', '您的密码已成功修改，请使用新密码登录');
});
changePassword.onChangeError(() => {
   message.error('修改失败', '密码修改失败，请重试');
});

const email = ref('');
watch(
   () => authStore.user?.email,
   (newEmail) => {
      if (newEmail) {
         email.value = newEmail;
      }
   },
   { immediate: true },
);

const sendingCode = computed(
   () => changePassword.sendingCode.value || changePassword.verifyingCode.value,
);
</script>

<template>
   <StSpace fill-x direction="vertical" gap="1.5rem">
      <!-- WebAuthn Card -->
      <Section
         title="WebAuthn 身份验证"
         desc="使用生物识别或安全密钥进行无密码登录"
         :icon="Fingerprint">
         <StForm
            :ref="authn.formKey"
            class="w-full"
            @keydown.enter.prevent="authn.handleRegister">
            <StSpace direction="vertical" gap="0.75rem">
               <StFormItem name="email" class="!w-full md:!w-96">
                  <Input
                     autocomplete="webauthn"
                     placeholder="请输入您的邮箱地址"
                     readonly
                     :value="email"
                     :icon="Mail" />
               </StFormItem>

               <Button
                  @click="webauthnRegistered === 0 && authn.handleRegister()"
                  :disabled="webauthnRegistered === 1"
                  :loading="authn.loading.value">
                  {{ webauthnRegistered === 1 ? '设备已注册' : '注册新设备' }}
               </Button>
            </StSpace>
         </StForm>
      </Section>

      <Divider />

      <Section title="密码设置" desc="修改您的登录密码" :icon="Key">
         <StForm>
            <StSpace direction="vertical" gap="0.75rem">
               <StFormItem name="verifyCode" class="!w-full md:!w-96">
                  <StInput
                     placeholder="请输入您的邮箱地址"
                     suffixClass="!text-lg"
                     :value="email"
                     :disabled="!!email"
                     :outer-class="[
                        '!border !border-accent-500 w-full focus-within:!border-primary/75 !rounded-md !py-2 !px-3',
                        {
                           '!cursor-not-allowed opacity-80 !bg-accent-600/50 !text-accent-400':
                              !!authStore.user?.email,
                        },
                     ]">
                     <template #prefix>
                        <Mail class="text-lg text-accent-400" />
                     </template>
                     <template #suffix>
                        <StSpace align="center" class="h-4">
                           <SendCodeButton
                              :interval="60"
                              :disabled="!email"
                              :loading="sendingCode"
                              :verified="changePassword.emailVerified.value"
                              @send="changePassword.sendEmail" />
                        </StSpace>
                     </template>
                  </StInput>
               </StFormItem>

               <StFormItem name="newPassword" class="!w-full md:!w-96">
                  <Input
                     password
                     v-model:value="changePassword.formdata.newPassword"
                     placeholder="请输入您的新密码"
                     :icon="Key" />
               </StFormItem>

               <StFormItem name="confirmNewPassword" class="!w-full md:!w-96">
                  <Input
                     password
                     v-model:value="changePassword.formdata.confirmPassword"
                     placeholder="确认您的新密码"
                     :icon="Key" />
               </StFormItem>

               <Button
                  @click="changePassword.handleChangePassword"
                  :loading="changePassword.loading.value">
                  修改密码
               </Button>
            </StSpace>
         </StForm>
      </Section>
   </StSpace>
</template>
