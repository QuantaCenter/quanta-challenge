<script setup lang="ts">
import { Caution, Refresh } from '@icon-park/vue-next';

/** 在线开发环境启动失败的统一提示：把技术报错翻译成用户能看懂的文案，并给出可执行的建议。 */
const props = defineProps<{
   /** 底层报错原文（可能较技术化），用于折叠展示与规则匹配 */
   reason?: string | null;
}>();

const isCrossOriginIssue = () =>
   /SharedArrayBuffer|crossOriginIsolated|跨源隔离/i.test(props.reason ?? '');
const isInsecureContext = () =>
   /localhost|HTTPS|安全上下文|不是 localhost/i.test(props.reason ?? '');
const isNetworkIssue = () =>
   /超时|timeout|stackblitz|网络/i.test(props.reason ?? '');
const isSnapshotIssue = () =>
   /快照镜像|snapshot/i.test(props.reason ?? '');

const friendlySummary = computed(() => {
   if (isCrossOriginIssue())
      return '当前浏览器未开启跨源隔离，在线运行环境无法正常工作。';
   if (isInsecureContext())
      return '当前访问地址不安全，浏览器拒绝了在线运行环境。';
   if (isNetworkIssue())
      return '环境启动超时，可能是网络不稳定或运行时服务暂时不可访问。';
   if (isSnapshotIssue())
      return '题目资源加载失败，可能是网络中断或资源暂不可用。';
   return '环境启动失败，可能是网络波动或浏览器限制导致。';
});

const reloading = ref(false);
const reload = () => {
   reloading.value = true;
   useEventBus('editor-env-retry').emit(true);
   window.location.reload();
};
</script>

<template>
   <StSpace
      direction="vertical"
      gap="2rem"
      align="center"
      fill-x
      class="mx-auto max-w-[28rem] px-6 py-2 text-center">
      <StSpace direction="vertical" gap="0.75rem" fill-x align="center">
         <StSpace
            center
            no-shrink
            class="size-[3rem] rounded-full bg-error/15 text-error">
            <Caution class="text-[1.5rem]" theme="filled" />
         </StSpace>
         <span class="st-font-title-normal text-accent-100">
            在线开发环境未能启动
         </span>
         <span class="st-font-caption text-accent-100 opacity-50 max-w-[16rem]">
            {{ friendlySummary }}
         </span>
      </StSpace>
      <StButton size="sm" class="w-[10rem]" @click="reload">
         <Refresh class="mr-3" :class="{ 'animate-spin': reloading }" />
         重试
      </StButton>
   </StSpace>
</template>
