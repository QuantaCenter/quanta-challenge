<script setup lang="ts">
import { Code } from '@icon-park/vue-next';

/** 「如何调用」卡片：给出完整地址 + 令牌的请求示例。 */
const props = defineProps<{
   name: string;
}>();

const appBaseUrl = useRuntimeConfig().public.appBaseUrl;
const callExample = computed(
   () => `// 在题目代码里调用：用平台的完整地址 + 调用令牌
// 令牌在左侧边栏的钥匙图标「云函数调用凭证」里查看
const res = await fetch('${appBaseUrl}/api/cloud-function/${props.name}', {
   method: 'POST',
   headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + CF_TOKEN,
   },
   body: JSON.stringify({ input: { /* 任意 JSON */ } }),
});
const { data } = await res.json();`,
);
</script>

<template>
   <section class="w-full rounded-2xl border border-accent-500 p-6">
      <StSpace align="center" gap="0.625rem" class="mb-5">
         <Code class="text-[1.375rem] text-accent-200" />
         <h2 class="st-font-third-bold text-white">如何调用</h2>
      </StSpace>
      <div class="w-full overflow-auto rounded-[0.25rem] bg-accent-600 p-4">
         <StCodePreview :code="callExample" />
      </div>
   </section>
</template>
