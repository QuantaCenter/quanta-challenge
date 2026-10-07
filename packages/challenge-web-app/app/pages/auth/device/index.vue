<script setup lang="ts">
import { CheckOne, CloseOne, Key, Terminal } from '@icon-park/vue-next';
import {
   DEVICE_FLOW_CLIENT_ID,
   DEVICE_FLOW_SCOPE,
   USER_CODE_ALPHABET,
   formatUserCode,
} from '@challenge/shared/oauth';
import { useMessage } from '~/components/st/Message/use-message';
import useAuthStore from '~/stores/auth-store';

/**
 * 设备授权确认页（RFC 8628 §3.3）。
 *
 * 两个必须做到的事：
 *   1. 让用户**核对验证码**：本页显示的码必须与终端里的一致。
 *      这是 RFC §5.4 要求的防远程钓鱼手段 —— 攻击者可以在邮件里让受害者
 *      "打开这个链接并输入码"，但无法让受害者手里的终端显示同样的码。
 *   2. 明确告知"在给谁授权、授予什么权限"，并要求显式确认（不能是自动通过）。
 *
 * 组件用法上有两处容易踩的坑（本页第一版就踩了，表现为"验证码和按钮文字都不显示"）：
 *   · `StInput` 的 v-model 参数名是 **value**（`defineModel('value')`），
 *     不是 `model-value`；写错时输入框既不显示值也收不到输入。
 *   · `StButton` 渲染的是 `<button>`，`:value` 不会被显示，
 *     文字必须走**默认插槽**；用 `text="…"` 会得到一个空按钮。
 */
useSeoMeta({ title: '设备授权 - Quanta Challenge' });

const route = useRoute();
const userCodeFromQuery = computed(() => (route.query.user_code as string) ?? '');
const state = ref<'idle' | 'loading' | 'ready' | 'approved' | 'denied' | 'error'>('idle');
const errorMessage = ref('');
const attemptsRemaining = ref<number | null>(null);
const session = ref<{ user_code: string; scope: string; client_id: string } | null>(null);
const submitting = ref(false);

const authStore = useAuthStore();
const message = useMessage();

/**
 * 登录状态在 **setup 顶层 await**，而不是 onMounted（参照 challenge-layout.vue）。
 *
 * 为什么不能用 onMounted + 三态：onMounted **只在客户端执行**，
 * 因此 SSR 输出的 HTML 永远是“检查中”那个分支（实测 curl 页面就是如此）。
 * 后果有两个：
 *   1. 已登录用户每次进页都会先闪一下“正在检查登录状态”，然后才变成输入框；
 *   2. SSR 期间两个分支都不渲染，直出的 HTML 里连按钮都没有（空壳），
 *      首屏（无 JS / 慢网）看到的是一个没有验证码、没有按钮的页面。
 *
 * 顶层 await 能成立的前提是 tRPC 插件在 SSR 期间会把 cookie 一并转发
 * （见 app/plugins/trpc.ts：isServer 时带上 cookie 与 `x-ssr: 1`），
 * 所以服务端这次调用拿到的就是这位用户真实、已鉴权的状态，
 * 首屏 HTML 直接就是最终形态，无需客户端重新判断。
 */
// CSRF token 存在 localStorage，只在客户端存在；先恢复以免后续
// decision 请求缺 x-csrf-token 被服务端 403。SSR 时为空，不影响鉴权。
if (import.meta.client && !authStore.csrfToken) authStore.initToken();

/**
 * 查询当前登录用户。
 *
 * **特意用 `$fetch` 直连端点，而不是 authStore.fetchUserInfo($trpc)**：
 * tRPC 插件的全局 401 拦截器把任何 401 都当成“登录过期”，
 * 直接 302 到 `/auth/login`（见 app/plugins/trpc.ts 的 redirectToLogin）。
 * 那个行为对 `/app/**` 是对的（会话失效就该重新登录），
 * 但对本页是错的：“未登录”在这里是**合法的落地状态**，
 * 页面本来就需要自行展示“请先登录”并引导授权，而不是被踢去登录页。
 *
 * 实测后果：用 fetchUserInfo 时，未登录访问 `/auth/device` 会 302 到
 * `/auth/login?redirect=/auth/device`，本页永远渲染不出来。
 */
const resolveCurrentUser = async (): Promise<boolean> => {
   try {
      const response = await $fetch<{ result?: { data?: { user?: unknown } } }>(
         '/api/trpc/auth.login.getUser',
         {
            query: { input: JSON.stringify({}) },
            headers: import.meta.server
               ? { 'x-ssr': '1', cookie: useRequestHeaders(['cookie']).cookie ?? '' }
               : { 'x-ssr': '1' },
         },
      );
      return Boolean(response?.result?.data?.user);
   } catch {
      // 401 在这里是普通结果（未登录），不是错误
      return false;
   }
};

const authenticated = await resolveCurrentUser();
const loggedIn = computed(() => authenticated);

/**
 * 输入中的验证码（**已归一化**：无分隔符、全大写、仅含合法字符）。
 *
 * 归一化现在由 StOtpInput 负责（它用同一个 USER_CODE_ALPHABET 清洗输入），
 * 因此这里不再重复做一遍 —— 两份清洗逻辑一旦漂移，就会出现
 * "界面看着对、查询却差一个字符"的诡异问题。
 * URL 带过来的值（verification_uri_complete）也要先清洗再注入，
 * 因为它是从 URL 来的文本，未必干净。
 */
const sanitizeUserCode = (raw: string): string =>
   [...raw.toUpperCase()]
      .filter((char) => USER_CODE_ALPHABET.includes(char))
      .join('')
      .slice(0, 8);

const input = ref(sanitizeUserCode(userCodeFromQuery.value ?? ''));

const lookup = async () => {
   if (!input.value.trim()) return;
   state.value = 'loading';
   errorMessage.value = '';
   try {
      const result = await $fetch<{
         user_code?: string;
         scope?: string;
         client_id?: string;
         error?: string;
         error_description?: string;
         attempts_remaining?: number;
      }>('/api/oauth/device/session', { query: { user_code: input.value } });
      if (result.error) throw new Error(result.error_description ?? result.error);
      session.value = {
         user_code: result.user_code ?? '',
         scope: result.scope ?? '',
         client_id: result.client_id ?? '',
      };
      state.value = 'ready';
   } catch (error: any) {
      const body = error?.data ?? {};
      attemptsRemaining.value = body.attempts_remaining ?? null;
      errorMessage.value =
         body.error_description ?? error?.message ?? '验证码不存在或已过期';
      state.value = 'error';
   }
};

// 已登录且 URL 带了验证码（verification_uri_complete）时才自动查询：
// 否则会拿空值打一次接口并白白消耗一次尝试次数。
//
// 只在客户端触发：`$fetch` 到相对路径时，服务端不会自动带上当前用户的 cookie，
// 而 session 接口要求登录，SSR 期间调它只会拿到 401 并把页面置为错误态。
// 这一步属于便利操作，不需要参与 SSR —— 登录态的判定已经在上面 await 完成了。
if (import.meta.client && authenticated && userCodeFromQuery.value) {
   void lookup();
}

const decide = async (action: 'approve' | 'deny') => {
   submitting.value = true;
   try {
      await $fetch('/api/oauth/device/decision', {
         method: 'POST',
         // CSRF 双提交：cookie 里的 token 必须与请求头一致
         headers: { 'x-csrf-token': authStore.csrfToken ?? '' },
         body: { user_code: input.value, action },
      });
      state.value = action === 'approve' ? 'approved' : 'denied';
   } catch (error: any) {
      message.error(error?.data?.error_description ?? '操作失败，请重试');
   } finally {
      submitting.value = false;
   }
};

// 自动查询的触发时机挪到 onMounted 里的登录检查之后：
// 未登录时先拉用户信息，查完再决定是否查询验证码 ——
// 否则会先打一次 session 接口白白消耗一次尝试次数。
const gotoLogin = () => {
   navigateTo(`/auth/login?redirect=${encodeURIComponent(route.fullPath)}`);
};

const scopeLabel = computed(() => {
   const scopes = (session.value?.scope ?? DEVICE_FLOW_SCOPE).split(/\s+/);
   return scopes.map((s) =>
      s === 'problem:write' ? '创建与管理题目（上传、发布）' : s,
   );
});

const displayName = computed(
   () => authStore.user?.displayName || authStore.user?.name || '当前账号',
);
</script>

<template>
   <div class="w-screen h-screen flex items-center justify-center">
      <div
         class="bg-[#1a1a1a] p-6 pt-8 flex flex-col items-center rounded-r5 gap-6 w-[28.5rem]">
         <IconLogo />

         <div class="flex flex-col items-center gap-r6">
            <h1 class="text-2xl font-bold">设备授权</h1>
            <p class="text-center text-sm text-accent-300 leading-relaxed">
               有终端正在请求访问你的账号
            </p>
         </div>

         <!-- 未登录：先去登录 -->
         <template v-if="!loggedIn">
            <p class="text-sm text-warning">请先登录后再授权</p>
            <StButton class="w-full" @click="gotoLogin">去登录</StButton>
         </template>

         <!-- 输入验证码 -->
         <template
            v-else-if="state === 'idle' || state === 'loading' || state === 'error'">
            <div class="w-full flex flex-col gap-4">
               <!-- 用 OTP 分组输入：设备码本身就是 4+4 分组格式（RFC 8628 §6.1），
                    分组后便于与终端逐格核对，粘贴带横线的整串也能正确清洗。 -->
               <StOtpInput
                  v-model="input"
                  :group-size="4"
                  :group-count="2"
                  :alphabet="USER_CODE_ALPHABET"
                  :disabled="state === 'loading'"
                  autofocus
                  @complete="lookup"
                  @submit="lookup" />

               <p class="text-center text-xs text-accent-300 min-h-[1rem]">
                  <template v-if="errorMessage">
                     <span class="text-error">{{ errorMessage }}</span>
                     <span v-if="attemptsRemaining !== null">
                        （还可尝试 {{ attemptsRemaining }} 次）
                     </span>
                  </template>
                  <template v-else>
                      请填写终端上的验证码
                  </template>
               </p>
            </div>
         </template>

         <!-- 确认授权 -->
         <template v-else-if="state === 'ready'">
            <div class="w-full flex flex-col gap-4">
               <!-- 验证码是这一页的核心：给足对比度与字号，便于与终端逐字核对 -->
               <div
                  class="flex items-center justify-center gap-3 py-4 bg-accent-700 rounded-lg border border-accent-500">
                  <Terminal class="text-2xl text-accent-300" />
                  <span class="text-2xl tracking-[0.2em] text-white">
                     {{ session?.user_code }}
                  </span>
               </div>
               <p class="text-center text-xs text-accent-300">
                  请确认它与终端里显示的一致
               </p>

               <div class="flex flex-col gap-3 text-sm border-t border-accent-600 pt-4">
                  <div class="flex items-center gap-2">
                     <Key class="text-lg text-accent-300" />
                     <span class="text-accent-300">授权账号</span>
                     <span class="ml-auto font-medium">{{ displayName }}</span>
                  </div>
                  <div class="flex items-start gap-2">
                     <span class="text-accent-300 w-14 shrink-0">应用</span>
                     <span class="ml-auto font-mono text-xs text-accent-200 text-right break-all">
                        {{ session?.client_id || DEVICE_FLOW_CLIENT_ID }}
                     </span>
                  </div>
                  <div class="flex items-start gap-2">
                     <span class="text-accent-300 w-14 shrink-0">权限</span>
                     <ul class="ml-auto text-right">
                        <li v-for="s in scopeLabel" :key="s">{{ s }}</li>
                     </ul>
                  </div>
               </div>
            </div>

            <div class="flex gap-4 w-full">
               <StButton
                  theme="danger"
                  bordered
                  class="flex-1"
                  :loading="submitting"
                  @click="decide('deny')">
                  拒绝
               </StButton>
               <StButton
                  class="flex-1"
                  :loading="submitting"
                  @click="decide('approve')">
                  同意授权
               </StButton>
            </div>
         </template>

         <!-- 结果 -->
         <template v-else-if="state === 'approved'">
            <CheckOne class="text-5xl text-success" />
            <p class="text-center">
               授权成功，已通知终端
               <br />
               <span class="text-sm text-accent-300">
                  现在可以关闭本页面并回到终端继续操作
               </span>
            </p>
         </template>

         <template v-else-if="state === 'denied'">
            <CloseOne class="text-5xl text-error" />
            <p class="text-center">
               已拒绝本次授权
            </p>
         </template>
      </div>
   </div>
</template>
