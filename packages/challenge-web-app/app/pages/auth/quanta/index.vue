<script setup lang="ts">
import useAuthStore from '~/stores/auth-store';
import { LoginResponseError, loginError, parseLoginContext, parseSessionResult } from '~/utils/quanta-login';

useSeoMeta({ title: 'Quanta 登录 - Challenge', referrer: 'no-referrer' });
const route = useRoute();
const authStore = useAuthStore();
const { $trpc } = useNuxtApp();
const status = ref<'loading' | 'choice' | 'verify' | 'confirm' | 'error'>('loading');
const name = ref('');
const linkName = ref('');
const csrf = ref('');
const message = ref('');
const busy = ref(false);
const email = ref('');
const password = ref('');
const restart = ref(false);
let alive = true;
function showError(error: unknown, terminal = false) {
   if (!alive) return;
   const failure = loginError(error);
   message.value = failure.message;
   restart.value = terminal || failure.restart;
   if (terminal || failure.restart) status.value = 'error';
}
async function finish() {
   const data = parseSessionResult(await $fetch('/api/auth/quanta/session', { credentials: 'same-origin' }));
   if (!alive) return;
   authStore.setCsrfToken(data.csrfToken);
   if (!(await authStore.fetchUserInfo($trpc))) throw new LoginResponseError();
   if (alive) window.location.replace(data.destination);
}
async function load() {
   status.value = 'loading'; message.value = ''; restart.value = false;
   try {
      const data = parseLoginContext(await $fetch('/api/auth/quanta/context', { credentials: 'same-origin' }));
      if (!alive) return;
      if (data.status === 'ready') { await finish(); return; }
      name.value = data.name; csrf.value = data.csrfToken; linkName.value = data.linkName || '';
      status.value = linkName.value ? 'confirm' : 'choice';
   } catch (error) { if (alive) { showError(error); status.value = 'error'; } }
}
async function act(action: 'verify' | 'create' | 'link') {
   if (busy.value) return;
   if (action === 'create' && !window.confirm('将创建一个全新的 Challenge 账号。已有做题记录请先绑定原账号，是否继续创建？')) return;
   busy.value = true; message.value = '';
   try {
      const result = await $fetch<{ status: string }>('/api/auth/quanta/onboarding', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': csrf.value }, body: action === 'verify' ? { action, email: email.value, password: password.value } : { action } });
      if (!alive) return;
      if (result?.status !== (action === 'verify' ? 'verified' : 'ready')) throw new LoginResponseError();
      if (action === 'verify') await load(); else await finish();
   } catch (error) { showError(error, action !== 'verify'); }
   finally { password.value = ''; busy.value = false; }
}
onBeforeUnmount(() => { alive = false; password.value = ''; });
onMounted(() => {
   const code = typeof route.query.error === 'string' ? route.query.error : '';
   if (code) { showError({ code }); status.value = 'error'; window.history.replaceState(window.history.state, '', '/auth/quanta'); }
   else void load();
});
function retry() {
   if (restart.value) window.location.assign('/api/auth/quanta/start');
   else void load();
}
</script>

<template>
   <main class="quanta-connect">
      <section class="quanta-connect-panel" aria-live="polite">
         <IconLogo />
         <template v-if="status === 'loading'"><h1>正在完成登录</h1><p>正在确认 Challenge 登录状态，请稍候…</p></template>
         <template v-else-if="status === 'choice'"><h1>第一次使用 Quanta 登录？</h1><p>当前塔员账号：{{ name }}</p><button :disabled="busy" class="quanta-connect-primary" @click="status = 'verify'">已有账号，验证并绑定</button><button :disabled="busy" @click="act('create')">第一次使用，创建新账号</button><small>绑定原账号可保留做题记录、积分和成就。</small></template>
         <form v-else-if="status === 'verify'" @submit.prevent="act('verify')"><h1>验证原 Challenge 账号</h1><p>验证后还需确认绑定，不会自动合并账号。</p><label>原账号邮箱<input v-model="email" type="email" autocomplete="username" required maxlength="254" :disabled="busy"></label><label>原账号密码<input v-model="password" type="password" autocomplete="current-password" required maxlength="200" :disabled="busy"></label><button class="quanta-connect-primary" :disabled="busy" type="submit">{{ busy ? '正在验证…' : '验证原账号' }}</button><button type="button" :disabled="busy" @click="status = 'choice'; password = ''">返回选择</button></form>
         <template v-else-if="status === 'confirm'"><h1>确认绑定账号</h1><p>Quanta：{{ name }}<br>Challenge：{{ linkName }}</p><small>将保留原 Challenge 账号的权限、做题记录与资料。</small><button class="quanta-connect-primary" :disabled="busy" @click="act('link')">{{ busy ? '正在绑定…' : '确认绑定并登录' }}</button><button :disabled="busy" @click="status = 'verify'; password = ''">重新验证其他账号</button></template>
         <template v-else><h1>暂时无法完成登录</h1><button class="quanta-connect-primary" @click="retry">{{ restart ? '重新发起 Quanta 登录' : '重新检查' }}</button></template>
         <p v-if="message" role="alert" class="quanta-connect-error">{{ message }}</p>
         <a href="/auth/login">返回 Challenge 登录</a>
      </section>
   </main>
</template>

<style scoped>
.quanta-connect { min-height:100dvh; padding:36px 16px; display:grid; place-items:center; background:#111; color:#e5e5e5; }
.quanta-connect-panel { width:100%; max-width:456px; border-radius:20px; background:#1a1a1a; padding:30px 24px; }
.quanta-connect-panel > svg { display:block; margin:0 auto 26px; }
h1 { font-size:23px; font-weight:700; margin:16px 0; }
p, small { color:#aaa; line-height:1.7; overflow-wrap:anywhere; }
small { display:block; font-size:13px; margin:16px 0; }
button { width:100%; min-height:46px; padding:12px; margin-top:12px; border-radius:9px; background:#272727; color:#ddd; }
button:disabled { opacity:.6; cursor:not-allowed; }
.quanta-connect-primary { background:#fa7c0e; color:#fff; font-weight:700; }
label { display:block; margin:16px 0; font-size:14px; }
input { display:block; width:100%; background:#111; border:1px solid #444; color:#eee; border-radius:9px; padding:12px; font-size:16px; margin-top:8px; }
a { display:block; color:#aaa; margin-top:22px; text-align:center; text-decoration:underline; text-underline-offset:4px; }
.quanta-connect-error { color:#ffa18c; margin-top:16px; }
</style>
