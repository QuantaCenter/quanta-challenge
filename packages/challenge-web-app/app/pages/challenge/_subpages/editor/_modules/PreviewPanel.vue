<script setup lang="ts">
import {
   Check,
   CheckOne,
   FullScreenTwo,
   LoadingFour,
   // 注意：@icon-park/vue-next 导出的名字是 OffScreen，没有 OffScreenTwo。
   // 原先这里写的是 OffScreenTwo（且并未 import），全屏退出按钮会渲染成 undefined 组件。
   OffScreen,
   Refresh,
   Round,
   WholeSiteAccelerator,
} from '@icon-park/vue-next';
import { useViewTransition } from '~/composables/use-view-transition';
import {
   type IPreviewServer,
   resolvePreviewUrl,
   toDisplayUrl,
} from '../_utils/preview-url';

const props = defineProps<{
   previewUrl?: string;
   /** 所有已就绪的服务，用于把地址栏里的 localhost:<port> 映射到对应预览域名 */
   servers?: IPreviewServer[];
   steps?: { idle: string; running: string }[];
   currentStep?: number;
   /** 环境不支持时展示的原因；非空时不再显示"正在启动"步骤列表 */
   unsupportedReason?: string | null;
}>();

/** iframe 当前加载的真实地址（预览域名）；主服务变化时重置 */
const currentUrl = ref<string>();
watch(
   () => props.previewUrl,
   (url) => {
      currentUrl.value = url;
   },
   { immediate: true },
);

const displayUrl = computed(() =>
   currentUrl.value ? toDisplayUrl(currentUrl.value) : '',
);

const addressInput = ref('');
const addressFocused = ref(false);
// 输入中不回写，避免防抖跳转后改写地址导致光标跳动
watch(
   displayUrl,
   (value) => {
      if (!addressFocused.value) addressInput.value = value;
   },
   { immediate: true },
);

const navigate = () => {
   const target = resolvePreviewUrl(
      addressInput.value,
      currentUrl.value,
      props.servers ?? [],
   );
   if (!target || target === currentUrl.value) return;
   currentUrl.value = target;
};
const debouncedNavigate = useDebounceFn(navigate, 800);

const onAddressBlur = () => {
   addressFocused.value = false;
   addressInput.value = displayUrl.value;
};
const onAddressEscape = (event: KeyboardEvent) => {
   addressInput.value = displayUrl.value;
   (event.target as HTMLInputElement).blur();
};

const fullScreenMode = ref(false);
const { startViewTransition } = useViewTransition({ delay: 150 });
const enterFullScreenMode = () => {
   startViewTransition(() => {
      fullScreenMode.value = true;
   });
};
const leaveFullScreenMode = () => {
   startViewTransition(() => {
      fullScreenMode.value = false;
   });
};

const refreshKey = ref(0);
const iframeSrc = computed(() => {
   if (!currentUrl.value) return '';
   const url = new URL(currentUrl.value);
   url.searchParams.set('v', String(refreshKey.value));
   return url.href;
});
const refresh = () => {
   refreshKey.value++;
};
</script>

<template>
   <StSpace fill direction="vertical" gap="0" class="bg-[#1F1F1F] rounded-xl">
      <StSpace
         fill-x
         class="p-1 rounded-t-xl bg-accent-600"
         justify="between"
         align="center"
         gap="0.25rem">
         <StSpace
            fill-x
            align="center"
            gap="0.5rem"
            class="h-[2rem] relative bg-accent-500 m-0.5 rounded-[0.5rem] px-3 text-accent-100">
            <WholeSiteAccelerator v-show="displayUrl" />
            <input
               v-model="addressInput"
               :disabled="!currentUrl"
               spellcheck="false"
               class="flex-1 min-w-0 h-full bg-transparent outline-none text-xs text-ellipsis"
               @focus="addressFocused = true"
               @blur="onAddressBlur"
               @input="debouncedNavigate"
               @keydown.enter="navigate"
               @keydown.esc="onAddressEscape" />
         </StSpace>
         <StRippleEffect>
            <StSpace
               @click="enterFullScreenMode"
               center
               no-shrink
               class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 cursor-pointer">
               <FullScreenTwo />
            </StSpace>
         </StRippleEffect>
         <StRippleEffect>
            <StSpace
               @click="refresh"
               center
               no-shrink
               class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-500 bg-secondary cursor-pointer">
               <Refresh />
            </StSpace>
         </StRippleEffect>
      </StSpace>
      <StSpace
         fill
         class="rounded-b-xl overflow-hidden border border-t-0 border-accent-600">
         <StSpace
            v-if="!props.previewUrl"
            direction="vertical"
            fill
            center
            :class="props.unsupportedReason ? '' : 'grayscale-100'">
            <!-- 出错时不要保留 grayscale：会把红色错误文字一并去色，导致提示看起来像灰色占位而没人注意 -->
            <IconLogo
               v-if="!props.unsupportedReason"
               class="w-[24rem] scale-[175%] opacity-50 mb-4 -mt-4" />
            <!-- 环境不满足 WebContainer 要求时，明确告诉用户原因，
                 否则页面只会一直停留在"正在启动开发容器…"，无法自行排查 -->
            <StSpace
               v-if="props.unsupportedReason"
               direction="vertical"
               gap="0.5rem"
               align="center"
               class="max-w-[34rem] px-6 text-center">
               <span class="st-font-body-bold text-error">
                  无法启动在线开发容器
               </span>
               <span class="st-font-caption text-accent-100 break-all">
                  {{ props.unsupportedReason }}
               </span>
               <span class="st-font-caption text-accent-300">
                  在浏览器按 F12 打开控制台可看到 [webcontainer] 开头的诊断日志。
                  在线运行需要：访问地址为 localhost 或 HTTPS、浏览器支持跨源隔离，
                  且能正常访问 stackblitz.com。
               </span>
            </StSpace>
            <StSpace v-else direction="vertical" gap="0.5rem">
               <StSpace
                  v-if="!iframeSrc"
                  v-for="(step, idx) in steps ?? []"
                  :key="idx"
                  align="center"
                  gap="0.5rem"
                  class="text-sm"
                  :class="
                     idx <= currentStep! ? 'text-accent-100' : 'text-accent-400'
                  ">
                  <CheckOne v-if="currentStep && currentStep > idx" />
                  <LoadingFour
                     v-else-if="currentStep === idx"
                     class="animate-spin" />
                  <Round v-else />
                  <div class="relative">
                     <div class="opacity-0 left-0 top-0">
                        {{ step.running }}
                     </div>
                     <div class="absolute left-0 top-0">
                        {{ currentStep === idx ? step.running : step.idle }}
                     </div>
                  </div>
               </StSpace>
            </StSpace>
         </StSpace>
         <Teleport v-else :disabled="!fullScreenMode" to="body">
            <div
               ref="previewContainer"
               style="view-transition-name: previewContainer"
               :class="{
                  'size-full ': !fullScreenMode,
                  'absolute w-[calc(100vw-4rem)] h-[calc(100vh-4rem)] left-8 top-8 rounded-xl overflow-hidden z-[10000] border border-accent-500 bg-[#1F1F1F]':
                     fullScreenMode,
               }">
               <StSpace
                  v-if="fullScreenMode"
                  @click="leaveFullScreenMode"
                  center
                  no-shrink
                  class="size-[3rem] rounded-full bg-accent-600 text-accent-200 opacity-50 absolute hover:opacity-80 transition-opacity cursor-pointer right-4 top-4 z-[10001]">
                  <OffScreen />
               </StSpace>
               <iframe :src="iframeSrc" class="size-full"></iframe>
            </div>
         </Teleport>
      </StSpace>
   </StSpace>
</template>

<style lang="css" src="@/assets/css/utils.css" />
