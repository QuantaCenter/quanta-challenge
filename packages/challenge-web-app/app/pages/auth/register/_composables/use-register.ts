import StForm from '~/components/st/Form/index.vue';
import useAuthStore from '~/stores/auth-store';

export const useRegister = () => {
   const formdata = reactive({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
   });
   const formKey = 'form';
   const form = useTemplateRef<InstanceType<typeof StForm>>(formKey);
   const authStore = useAuthStore();
   const { $trpc } = useNuxtApp();

   const { getCallback, on } = useStatusCallbacks<'success' | 'error'>();
   const onRegisterSuccess = (callback: Function) => on('success', callback);
   const onRegisterError = (callback: Function) => on('error', callback);

   const loading = ref(false);
   const handleRegister = async () => {
      if (!form.value) return;
      const isValid = form.value.validate().success;
      if (!isValid) {
         console.error('Validation failed');
         return;
      }

      try {
         loading.value = true;
         const result = await $trpc.auth.register.email.mutate({
            username: formdata.username,
            email: formdata.email,
            password: formdata.password,
            confirmPassword: formdata.confirmPassword,
         });
         authStore.setCsrfToken(result.csrfToken);
         // 这里是为了"注册成功后立刻进入已登录状态"而构造的本地对象，
         // 只用于首屏展示；真实数据由后续 authStore.fetchUserInfo() 从服务端拉取。
         // score 因此在本地写 0（注册接口返回值里没有该字段），不代表真实积分。
         authStore.user = {
            name: result.user.name,
            displayName: result.user.displayName,
            id: result.user.id,
            email: result.user.email,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLogin: new Date(),
            // 刚注册完就已经在用了，活跃时间从此刻算起
            lastActiveAt: new Date(),
            imageId: null,
            role: 'USER',
            score: 0,
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
      handleRegister,
      onRegisterSuccess,
      onRegisterError,
   };
};
