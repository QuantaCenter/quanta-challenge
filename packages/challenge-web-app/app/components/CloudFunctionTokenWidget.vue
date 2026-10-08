<script setup lang="ts">
import { Key } from '@icon-park/vue-next';
import { onClickOutside } from '@vueuse/core';
import CloudFunctionTokenPanel from '~/components/cloud-function/TokenPanel.vue';

/**
 * 侧边栏「云函数调用凭证」。
 *
 * 做题时不再走同源 sidecar：用户代码直接请求平台的**完整地址**并带上 Bearer 令牌，
 * 这样在做题预览页和判题环境里都能调通。这里用和「计时器」一样的侧边弹层，
 * 具体内容见 `cloud-function/TokenPanel.vue`。
 */
const props = defineProps<{ toolbar?: boolean }>();

const opened = ref(false);

const triggerRef = useTemplateRef<HTMLElement>('cf-trigger');
const popoverRef = useTemplateRef<HTMLElement>('cf-popover');

onClickOutside(
   popoverRef,
   () => {
      opened.value = false;
   },
   { ignore: [triggerRef.value] },
);

const toggle = () => {
   opened.value = !opened.value;
};
</script>

<template>
   <div class="relative">
      <!-- 触发按钮 -->
      <div ref="cf-trigger">
         <StMiniSidebarButton
            name="云函数调用凭证"
            @click="toggle"
            :class="[
               props.toolbar
                  ? '!px-0 !py-0 !size-[2.75rem] flex items-center justify-center'
                  : '!px-4',
               'transition-colors',
               { '!text-success': opened },
            ]">
            <Key class="text-[1.1rem]" />
         </StMiniSidebarButton>
      </div>

      <!-- 侧边弹层（与「计时器」同款） -->
      <Transition
         enter-active-class="transition-all duration-100 ease-out"
         enter-from-class="opacity-0"
         enter-to-class="opacity-100"
         leave-active-class="transition-all duration-100 ease-in"
         leave-from-class="opacity-100"
         leave-to-class="opacity-0">
         <div
            v-show="opened"
            ref="cf-popover"
            :class="[
               'absolute w-[27rem] max-h-[85vh] overflow-y-auto bg-accent-600 rounded-xl shadow-2xl border border-accent-500 z-50',
               props.toolbar
                  ? 'top-1/2 -translate-y-1/2 left-[calc(100%+0.5rem)]'
                  : 'top-full right-0 mt-2',
            ]">
            <CloudFunctionTokenPanel :active="opened" />
         </div>
      </Transition>
   </div>
</template>
