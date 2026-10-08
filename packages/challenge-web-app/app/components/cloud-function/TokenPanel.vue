<script setup lang="ts">
import { CheckOne, Copy, Key } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

/**
 * 「云函数调用凭证」弹层内容。
 *
 * 做题时用户代码直接请求平台的**完整地址**并带上 Bearer 令牌，这里把
 * 「地址 + 令牌 + 示例」摊开给用户复制。
 */
const props = defineProps<{
   /** 弹层是否打开；打开时才签发/复用令牌 */
   active: boolean;
}>();

const message = useMessage();
const runtimeConfig = useRuntimeConfig();

// 令牌在模块级缓存：有可用的就直接复用，不重新签发（否则用户粘进代码的令牌会显得“失效”）。
const {
   token,
   loading,
   error: failed,
   isUsable,
   ensure,
} = useCloudFunctionToken();

/** 刚复制过的项 id：短暂把「复制」图标换成绿色对勾。 */
const copied = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const baseUrl = computed(() => {
   // 优先用当前页面的 origin：它是用户此刻访问平台的真实地址（本机就是 localhost、
   // 局域网访问就是局域网 IP），比构建期写死的 APP_SERVER 更准。
   const origin =
      import.meta.client && window.location.origin
         ? window.location.origin
         : String(runtimeConfig.public.appBaseUrl ?? '');
   return origin.replace(/\/+$/, '');
});

const endpoint = computed(() => `${baseUrl.value}/api/cloud-function/<函数名>`);

const example = computed(
   () => `// 完整地址 + 令牌
await fetch('${baseUrl.value}/api/cloud-function/<函数名>', {
   method: 'POST',
   headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ${token.value || '<令牌>'}',
   },
   body: JSON.stringify({ input: {} }),
});`,
);

watch(
   () => props.active,
   (active) => {
      if (active && !isUsable()) {
         void ensure().catch(() => undefined);
      }
   },
);

const copy = async (key: string, text: string, tip: string) => {
   if (!text) return;
   try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
      copied.value = key;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
         copied.value = null;
      }, 1600);
   } catch {
      message.error('复制失败', '请手动选择复制');
   }
};

onUnmounted(() => {
   if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template>
   <div class="p-4">
      <h3 class="mb-1 text-base font-semibold text-white">云函数调用凭证</h3>
      <p class="mb-4 text-xs leading-relaxed text-accent-200">
         用户代码里用下面的<strong class="text-white">完整地址</strong> + 令牌请求。
      </p>

      <StSpace direction="vertical" fill-x gap="0.375rem" class="mb-4">
         <span class="text-xs text-accent-300">
            调用地址（替换 &lt;函数名&gt;）
         </span>
         <StSpace
            fill-x
            align="center"
            justify="between"
            gap="0.75rem"
            class="rounded-lg bg-accent-500 px-3 py-2">
            <code class="text-xs break-all text-accent-100">{{ endpoint }}</code>
            <button
               type="button"
               class="shrink-0 cursor-pointer rounded-sm p-1 text-accent-200 transition-colors hover:bg-accent-400 hover:text-white"
               @click="copy('endpoint', endpoint, '已复制调用地址')">
               <CheckOne
                  v-if="copied === 'endpoint'"
                  class="text-success"
                  :size="14" />
               <Copy v-else :size="14" />
            </button>
         </StSpace>
      </StSpace>

      <StSpace direction="vertical" fill-x gap="0.375rem" class="mb-4">
         <span class="text-xs text-accent-300">
            调用令牌（<code class="text-accent-100">Bearer &lt;令牌&gt;</code>）
         </span>
         <StSpace
            fill-x
            align="center"
            justify="between"
            gap="0.75rem"
            class="rounded-lg bg-accent-500 px-3 py-2">
            <code class="text-xs break-all text-accent-100">
               {{ token || (loading ? '正在获取…' : '—') }}
            </code>
            <button
               type="button"
               class="shrink-0 cursor-pointer rounded-sm p-1 text-accent-200 transition-colors hover:bg-accent-400 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
               :disabled="!token"
               @click="copy('token', token, '已复制令牌')">
               <CheckOne v-if="copied === 'token'" class="text-success" :size="14" />
               <Copy v-else :size="14" />
            </button>
         </StSpace>
         <span v-if="failed" class="text-xs text-error">{{ failed }}</span>
         <span v-else class="text-xs text-accent-300">
            有效期 2 小时，过期后自动换新。
         </span>
      </StSpace>

      <StSpace direction="vertical" fill-x gap="0.375rem">
         <StSpace fill-x align="center" justify="between">
            <span class="text-xs text-accent-300">示例</span>
            <button
               type="button"
               class="flex cursor-pointer items-center gap-1 text-xs text-accent-200 transition-colors hover:text-white"
               @click="copy('example', example, '已复制示例代码')">
               <CheckOne
                  v-if="copied === 'example'"
                  class="text-success"
                  :size="14" />
               <Copy v-else :size="14" />
               {{ copied === 'example' ? '已复制' : '复制示例' }}
            </button>
         </StSpace>
         <div
            class="w-full overflow-x-auto rounded-lg bg-accent-500 px-3 py-2 text-[0.6875rem] leading-[1.4]">
            <StCodePreview :code="example" />
         </div>
      </StSpace>

      <StSpace fill-x align="center" gap="0.375rem" class="mt-4 text-accent-300">
         <Key :size="14" class="shrink-0" />
         <span class="text-xs">令牌代表你的身份，请勿外泄。</span>
      </StSpace>
   </div>
</template>
