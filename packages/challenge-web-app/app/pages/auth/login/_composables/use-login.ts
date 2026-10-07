import type StForm from '~/components/st/Form/index.vue';
import useAuthStore from '~/stores/auth-store';

export const useEmailLogin = () => {
   const formdata = reactive<{ email: string; password: string }>({
      email: '',
      password: '',
   });
   const formKey = 'form';
   const form = useTemplateRef<InstanceType<typeof StForm>>(formKey);
   const loading = ref(false);

   const { $trpc } = useNuxtApp();
   const authStore = useAuthStore();

   const { getCallback, on } = useStatusCallbacks<'success' | 'error'>();
   const onLoginSuccess = (callback: Function) => on('success', callback);
   const onLoginError = (callback: Function) => on('error', callback);

   const handleLogin = async () => {
      if (!form.value) return;
      const isValid = form.value.validate().success;
      if (!isValid) {
         console.error('Validation failed');
         return;
      }

      try {
         loading.value = true;
         const result = await $trpc.auth.login.email.mutate({
            email: formdata.email,
            password: formdata.password,
         });
         authStore.setCsrfToken(result.csrfToken);
         authStore.user = {
            ...result.user,
            lastLogin: new Date(result.user.lastLogin),
            createdAt: new Date(result.user.createdAt),
            updatedAt: new Date(result.user.updatedAt),
            lastActiveAt: result.user.lastActiveAt
               ? new Date(result.user.lastActiveAt)
               : null,
         };
         getCallback('success').forEach((cb) => cb());
      } catch (error) {
         getCallback('error').forEach((cb) => cb(error));
         loading.value = false;
      }
   };

   return {
      formdata,
      formKey,
      loading,
      handleLogin,
      onLoginSuccess,
      onLoginError,
   };
};
