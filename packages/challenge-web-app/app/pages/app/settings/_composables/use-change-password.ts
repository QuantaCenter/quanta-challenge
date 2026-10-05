import StForm from '~/components/st/Form/index.vue';
import OneTimePassword from '~/components/OneTimePassword.vue';
import { useMessage } from '~/components/st/Message/use-message';

export const useChangePassword = () => {
   const formdata = reactive({
      verifyToken: '',
      newPassword: '',
      confirmPassword: '',
   });
   const formKey = 'changePasswordForm';
   const form = useTemplateRef<InstanceType<typeof StForm>>(formKey);
   const loading = ref(false);

   const { getCallback, on } = useStatusCallbacks<'success' | 'error'>();
   const onChangeSuccess = (callback: Function) => on('success', callback);
   const onChangeError = (callback: Function) => on('error', callback);

   // 修改密码
   const { $trpc } = useNuxtApp();
   const handleChangePassword = async () => {
      if (!form.value) return;
      const isValid = form.value.validate().success;
      if (!isValid) {
         console.error('Validation failed');
         return;
      }

      try {
         loading.value = true;

         const success =
            await $trpc.protected.user.changePassword.mutate(formdata);
         if (!success) {
            throw new Error('Failed to change password');
         }

         getCallback('success').forEach((cb) => cb());
      } catch (error) {
         getCallback('error').forEach((cb) => cb());
      } finally {
         loading.value = false;
      }
   };

   // 展示验证码输入框
   const errored = ref(false);
   const otpRef = ref<InstanceType<typeof OneTimePassword> | null>(null);

   let closeOtp: (() => void) | null = null;
   onUnmounted(() => {
      if (closeOtp) {
         closeOtp();
      }
   });

   const message = useMessage();
   const showOTP = () => {
      const { close } = message.custom({
         render: ({ onClose }) =>
            h(OneTimePassword, {
               ref: otpRef,
               length: 4,
               error: errored.value,
               onComplete: (code: string) => {
                  verifyCode(code);
                  onClose();
                  if (closeOtp === close) {
                     closeOtp = null;
                  }
               },
            }),
         duration: 0,
      });
      closeOtp = close;
   };

   // 发送验证码
   const sendingCode = ref(false);
   const sendEmail = async () => {
      sendingCode.value = true;
      try {
         const success = await atLeastTime(
            500,
            $trpc.protected.verify.sendVerifyCode.mutate(),
         );
         if (success) {
            showOTP();
         } else {
            message.error('发送失败', '验证码发送失败，请检查邮箱地址是否正确');
         }
      } catch (error) {
         message.error('发送失败', '验证码发送失败，请稍后再试');
      } finally {
         sendingCode.value = false;
      }
   };

   // 验证验证码
   const emailVerified = ref(false);
   const verifyingCode = ref(false);
   const verifyCode = async (code: string) => {
      verifyingCode.value = true;
      try {
         const result = await atLeastTime(
            1000,
            $trpc.protected.verify.verifyCode.mutate({ code }),
         );
         if (result.success) {
            emailVerified.value = true;
            formdata.verifyToken = result.token;
            message.success('验证成功', '验证码验证成功，您现在可以修改密码');
         } else {
            errored.value = true;
            showOTP();
         }
      } finally {
         otpRef.value?.clear();
         verifyingCode.value = false;
      }
   };

   return {
      formdata,
      formKey,
      loading,
      handleChangePassword,
      onChangeSuccess,
      onChangeError,
      sendEmail,
      sendingCode,
      errored,
      otpRef,
      emailVerified,
      verifyingCode,
   };
};
