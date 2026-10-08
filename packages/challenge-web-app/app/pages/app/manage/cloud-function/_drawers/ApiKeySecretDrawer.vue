<script setup lang="ts">
import { Copy } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';

/** 「请立即保存 secret」抽屉：secret 只在签发后出现一次。 */
defineProps<{
   secret: { keyId: string; secret: string } | null;
}>();

const opened = defineModel<boolean>('opened', { default: false });

const message = useMessage();

const copy = async (text: string, tip: string) => {
   try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
   } catch {
      message.error('复制失败', '请手动选择复制');
   }
};
</script>

<template>
   <StDrawer global v-model:opened="opened" width="34rem">
      <StSpace direction="vertical" gap="0" class="h-screen text-white" fill>
         <StSpace direction="vertical" gap="1.5rem" class="w-full flex-1 p-6">
            <StSpace direction="vertical" gap="0.25rem">
               <h2 class="st-font-secondary-bold">请立即保存 Secret</h2>
               <p class="st-font-caption text-accent-300">
                  关闭后无法再次查看。Key ID 为
                  <span class="font-mono text-accent-100">
                     {{ secret?.keyId }}
                  </span>
               </p>
            </StSpace>

            <div
               class="relative rounded-lg border border-accent-500 bg-accent-700 p-4 pr-12">
               <code
                  class="block break-all font-mono text-[0.8125rem] leading-relaxed text-secondary">
                  {{ secret?.secret }}
               </code>
               <button
                  type="button"
                  title="复制"
                  aria-label="复制"
                  class="absolute right-2 top-2 flex items-center justify-center size-8 rounded-md text-accent-300 transition-all hover:bg-accent-500 hover:text-white cursor-pointer"
                  @click="
                     secret && copy(secret.secret, '已复制到剪贴板')
                  ">
                  <Copy class="text-[1.125rem]" />
               </button>
            </div>
         </StSpace>

         <StSpace justify="end" class="w-full border-t border-accent-600 p-4">
            <StButton
               class="py-[0.375rem] px-[1.25rem] text-accent-100 !rounded-[0.5rem]"
               @click="opened = false">
               我已保存
            </StButton>
         </StSpace>
      </StSpace>
   </StDrawer>
</template>
