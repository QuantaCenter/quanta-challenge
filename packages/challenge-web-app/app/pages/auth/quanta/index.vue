<script setup lang="ts">
import useAuthStore from '~/stores/auth-store';
import {
   LoginResponseError,
   loginError,
   parseAuthorizationResult,
   parseLoginContext,
   parseSessionResult,
} from '~/utils/quanta-login';

useSeoMeta({ title: 'Quanta 登录 - Challenge', referrer: 'no-referrer' });

type LoginStatus = 'loading' | 'choice' | 'verify' | 'confirm' | 'error';

const route = useRoute();
const authStore = useAuthStore();
const { $trpc } = useNuxtApp();
const status = ref<LoginStatus>('loading');
const name = ref('');
const linkName = ref('');
const csrfToken = ref('');
const message = ref('');
const busy = ref(false);
const email = ref('');
const password = ref('');
const restart = ref(false);
let alive = true;

function showError(error: unknown, terminal = false) {
   if (!alive) {
      return;
   }

   const failure = loginError(error);
   message.value = failure.message;
   restart.value = terminal || failure.restart;
   if (terminal || failure.restart) {
      status.value = 'error';
   }
}

async function finish() {
   const result = await $trpc.auth.quanta.session.mutate();
   const data = parseSessionResult(result);
   if (!alive) {
      return;
   }

   // Replace the previous account's proof only after the handoff is validated.
   authStore.setCsrfToken(data.csrfToken);
   if (!(await authStore.fetchUserInfo($trpc))) {
      throw new LoginResponseError();
   }
   if (alive) {
      window.location.replace(data.destination);
   }
}

async function load() {
   status.value = 'loading';
   message.value = '';
   restart.value = false;

   try {
      const data = parseLoginContext(await $trpc.auth.quanta.context.query());
      if (!alive) {
         return;
      }
      if (data.status === 'ready') {
         await finish();
         return;
      }

      name.value = data.name;
      csrfToken.value = data.csrfToken;
      linkName.value = data.linkName || '';
      status.value = linkName.value ? 'confirm' : 'choice';
   } catch (error) {
      if (alive) {
         showError(error);
         status.value = 'error';
      }
   }
}

async function act(action: 'verify' | 'create' | 'link') {
   if (busy.value) {
      return;
   }
   if (
      action === 'create' &&
      !window.confirm(
         '将创建一个全新的 Challenge 账号。已有做题记录请先绑定原账号，是否继续创建？',
      )
   ) {
      return;
   }

   busy.value = true;
   message.value = '';
   try {
      const proof = csrfToken.value;
      const input =
         action === 'verify'
            ? {
                 action,
                 csrfToken: proof,
                 email: email.value,
                 password: password.value,
              }
            : { action, csrfToken: proof };
      const result = await $trpc.auth.quanta.onboarding.mutate(input);

      if (!alive) {
         return;
      }
      if (result.status !== (action === 'verify' ? 'verified' : 'ready')) {
         throw new LoginResponseError();
      }
      if (action === 'verify') {
         await load();
      } else {
         await finish();
      }
   } catch (error) {
      showError(error, action !== 'verify');
   } finally {
      password.value = '';
      busy.value = false;
   }
}

async function beginLogin() {
   if (busy.value) {
      return;
   }
   busy.value = true;
   try {
      const result = await $trpc.auth.quanta.start.mutate();
      const target = parseAuthorizationResult(result, window.location.origin);
      if (alive) {
         window.location.assign(target);
      }
   } catch (error) {
      showError(error, true);
   } finally {
      busy.value = false;
   }
}

function retry() {
   if (restart.value) {
      void beginLogin();
   } else {
      void load();
   }
}

function showOriginalAccountForm() {
   password.value = '';
   status.value = 'verify';
}

function backToChoice() {
   password.value = '';
   message.value = '';
   status.value = 'choice';
}

onBeforeUnmount(() => {
   alive = false;
   password.value = '';
});

onMounted(() => {
   const code = typeof route.query.error === 'string' ? route.query.error : '';
   if (code) {
      showError({ code });
      status.value = 'error';
      window.history.replaceState(window.history.state, '', '/auth/quanta');
   } else {
      void load();
   }
});
</script>

<template>
   <main
      class="grid min-h-dvh place-items-center bg-background px-4 py-9 text-accent-100"
   >
      <section
         class="w-full max-w-[28.5rem] rounded-r5 bg-[#1a1a1a] px-6 py-8"
         aria-live="polite"
         :aria-busy="busy || status === 'loading'"
      >
         <IconLogo class="mx-auto mb-6 block" />

         <template v-if="status === 'loading'">
            <h1 class="my-4 text-2xl font-bold">正在完成登录</h1>
            <p class="text-accent-300 leading-relaxed">
               正在确认 Challenge 登录状态，请稍候…
            </p>
         </template>

         <template v-else-if="status === 'choice'">
            <h1 class="my-4 text-2xl font-bold">第一次使用 Quanta 登录？</h1>
            <p class="break-words text-accent-300 leading-relaxed">
               当前塔员账号：{{ name }}
            </p>
            <StButton
               class="mt-3 w-full"
               :disabled="busy"
               @click="showOriginalAccountForm"
            >
               已有账号，验证并绑定
            </StButton>
            <StButton
               class="mt-3 w-full !bg-accent-600 !text-accent-100"
               :disabled="busy"
               @click="act('create')"
            >
               第一次使用，创建新账号
            </StButton>
            <p class="my-4 text-sm text-accent-300 leading-relaxed">
               绑定原账号可保留做题记录、积分和成就。
            </p>
         </template>

         <form v-else-if="status === 'verify'" @submit.prevent="act('verify')">
            <h1 class="my-4 text-2xl font-bold">验证原 Challenge 账号</h1>
            <p class="text-accent-300 leading-relaxed">
               验证后还需确认绑定，不会自动合并账号。
            </p>
            <!-- biome-ignore lint/a11y/noLabelWithoutControl: StInput renders the nested input, so this label associates implicitly. -->
            <label class="my-4 block text-sm">
               原账号邮箱
               <StInput
                  v-model:value="email"
                  type="email"
                  autocomplete="username"
                  required
                  maxlength="254"
                  :disabled="busy"
                  outer-class="mt-2 border border-accent-500 bg-background focus-within:border-primary [&_input]:min-w-0"
               />
            </label>
            <!-- biome-ignore lint/a11y/noLabelWithoutControl: StInput renders the nested input, so this label associates implicitly. -->
            <label class="my-4 block text-sm">
               原账号密码
               <StInput
                  v-model:value="password"
                  password
                  autocomplete="current-password"
                  required
                  maxlength="200"
                  :disabled="busy"
                  outer-class="mt-2 border border-accent-500 bg-background focus-within:border-primary [&_input]:min-w-0"
               />
            </label>
            <StButton
               type="submit"
               class="mt-3 w-full"
               :disabled="busy"
               :text="busy ? '正在验证…' : '验证原账号'"
            />
            <StButton
               class="mt-3 w-full !bg-accent-600 !text-accent-100"
               :disabled="busy"
               @click="backToChoice"
            >
               返回选择
            </StButton>
         </form>

         <template v-else-if="status === 'confirm'">
            <h1 class="my-4 text-2xl font-bold">确认绑定账号</h1>
            <p class="break-words text-accent-300 leading-relaxed">
               Quanta：{{ name }}<br>
               Challenge：{{ linkName }}
            </p>
            <p class="my-4 text-sm text-accent-300 leading-relaxed">
               将保留原 Challenge 账号的权限、做题记录与资料。
            </p>
            <StButton class="mt-3 w-full" :disabled="busy" @click="act('link')">
               {{ busy ? '正在绑定…' : '确认绑定并登录' }}
            </StButton>
            <StButton
               class="mt-3 w-full !bg-accent-600 !text-accent-100"
               :disabled="busy"
               @click="showOriginalAccountForm"
            >
               重新验证其他账号
            </StButton>
         </template>

         <template v-else>
            <h1 class="my-4 text-2xl font-bold">暂时无法完成登录</h1>
            <StButton class="mt-3 w-full" :disabled="busy" @click="retry">
               {{ restart ? '重新发起 Quanta 登录' : '重新检查' }}
            </StButton>
         </template>

         <p
            v-if="message"
            role="alert"
            class="mt-4 break-words text-warning leading-relaxed"
         >
            {{ message }}
         </p>
         <NuxtLink
            to="/auth/login"
            class="mt-6 block text-center text-accent-300 underline underline-offset-4 hover:text-primary"
         >
            返回 Challenge 登录
         </NuxtLink>
      </section>
   </main>
</template>
