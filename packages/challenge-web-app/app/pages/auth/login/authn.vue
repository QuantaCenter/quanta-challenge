<script setup lang="ts">
import { useWebAuthnLogin } from './_composables/use-login-authn';
import type { IRule } from '~/components/st/Form/type';
import z from 'zod';
import { Key, Mail } from '@icon-park/vue-next';

useSeoMeta({ title: '生物认证 - Quanta Challenge' });

const {
   formdata,
   formKey,
   loading,
   handleStartAuthenticating,
   onAuthenticateSuccess,
   onAuthenticateError,
} = useWebAuthnLogin();

const redirect = useQuery<string>('redirect');
onAuthenticateSuccess(() => {
   window.location.href = redirect.value ?? '/app/dashboard';
});
onAuthenticateError(() => {
   alert('Authentication Failed');
});

const rules: IRule[] = [
   {
      field: 'email',
      required: true,
      validator: (value: string) => z.email().safeParse(value).success,
   },
];

const gotoPasswordLogin = () => {
   const url = redirect.value
      ? `/auth/login?redirect=${encodeURIComponent(redirect.value)}`
      : '/auth/login';
   navigateTo(url);
};
</script>

<template>
   <div class="w-screen h-screen flex items-center justify-center">
      <div
         class="bg-[#1a1a1a] p-6 pt-8 flex flex-col items-center rounded-r5 gap-6 w-[28.5rem]">
         <IconLogo />
         <div class="flex flex-col items-center gap-r6">
            <h1 class="text-2xl font-bold">生物认证登录</h1>
            <p>
               <span class="text-accent-300">还没有账号？ </span>
               <NuxtLink
                  href="/auth/register"
                  class="text-white underline underline-offset-3 hover:text-primary transition-all">
                  注册
               </NuxtLink>
            </p>
         </div>
         <StForm
            :ref="formKey"
            @keydown.enter.prevent="handleStartAuthenticating"
            v-model:model-value="formdata"
            :rules="rules"
            class="flex flex-col gap-4 w-full">
            <StFormItem name="email" error-message="请输入有效的邮箱地址">
               <StInput
                  autocomplete="webauthn"
                  v-model:value="formdata.email"
                  outer-class="bg-accent-700 border border-transparent focus-within:border-primary"
                  placeholder="请输入邮箱">
                  <template #prefix>
                     <Mail class="text-2xl" />
                  </template>
               </StInput>
            </StFormItem>
            <StButton :loading @click.prevent="handleStartAuthenticating">
               开始认证
            </StButton>
         </StForm>
         <StDivider>或使用</StDivider>
         <div class="flex gap-4 w-full text-sm">
            <StButton
               @click.self="gotoPasswordLogin"
               class="!bg-accent-600 !text-accent-200 w-full">
               <NuxtLink to="/auth/login" class="flex gap-2 items-center">
                  <Key class="text-xl text-[#9D9D9D]" />
                  密码登录
               </NuxtLink>
            </StButton>
         </div>
      </div>
   </div>
</template>
