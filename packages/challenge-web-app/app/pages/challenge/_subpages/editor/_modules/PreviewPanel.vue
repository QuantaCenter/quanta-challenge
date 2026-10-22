<script setup lang="ts">
import {
   Check,
   CheckOne,
   FullScreenTwo,
   LoadingFour,
   OffScreen,
   Refresh,
   Round,
   WholeSiteAccelerator,
} from '@icon-park/vue-next';
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

const FULLSCREEN_TARGET = {
   left: '2rem',
   top: '2rem',
   width: 'calc(100vw - 4rem)',
   height: 'calc(100vh - 4rem)',
   borderRadius: '0.75rem',
};
const FULLSCREEN_TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

/** 全屏层的定位样式：初始钉在容器内 iframe 的位置，再过渡到全屏 */
const fullscreenStyle = ref<Record<string, string>>({});

const inlineFrameRef = useTemplateRef<HTMLElement>('inline-frame');

const rectToStyle = (rect: DOMRect) => ({
   left: `${rect.left}px`,
   top: `${rect.top}px`,
   width: `${rect.width}px`,
   height: `${rect.height}px`,
});

let leaveTimer: ReturnType<typeof setTimeout> | undefined;

const enterFullScreenMode = () => {
   if (fullScreenMode.value) return;
   clearTimeout(leaveTimer);
   const rect = inlineFrameRef.value?.getBoundingClientRect();
   fullScreenMode.value = true;
   fullscreenStyle.value = {
      ...(rect ? rectToStyle(rect) : FULLSCREEN_TARGET),
      borderRadius: '0px',
      opacity: '1',
      pointerEvents: 'none',
      transition: 'none',
   };
   nextTick(() => {
      requestAnimationFrame(() => {
         requestAnimationFrame(() => {
            fullscreenStyle.value = {
               ...FULLSCREEN_TARGET,
               opacity: '1',
               pointerEvents: 'auto',
               transition: FULLSCREEN_TRANSITION,
            };
         });
      });
   });
};

const leaveFullScreenMode = () => {
   if (!fullScreenMode.value) return;
   const rect = inlineFrameRef.value?.getBoundingClientRect();
   if (!rect) {
      fullScreenMode.value = false;
      return;
   }
   fullscreenStyle.value = {
      ...rectToStyle(rect),
      borderRadius: '0px',
      opacity: '1',
      pointerEvents: 'none',
      transition: FULLSCREEN_TRANSITION,
   };
   leaveTimer = setTimeout(() => {
      fullScreenMode.value = false;
   }, 320);
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

/** 服务就绪过一次后又停掉（例如终端里 Ctrl+C），不再回到启动步骤列表 */
const serverStopped = ref(false);
const stoppedPort = ref<string>();
watch(
   () => props.previewUrl,
   (url, oldUrl) => {
      if (url) {
         serverStopped.value = false;
         return;
      }
      if (!oldUrl) return;
      serverStopped.value = true;
      try {
         stoppedPort.value = new URL(toDisplayUrl(oldUrl)).port || undefined;
      } catch {
         stoppedPort.value = undefined;
      }
   },
);

defineExpose({ refresh });
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
            <span v-else-if="serverStopped" class="text-sm text-accent-100">
               当前端口{{ stoppedPort ? ` ${stoppedPort} ` : '' }}暂无服务运行
            </span>
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
         <div
            v-else
            ref="inline-frame"
            class="size-full"
            :style="{ opacity: fullScreenMode ? 0 : 1 }">
            <iframe :src="iframeSrc" class="size-full"></iframe>
         </div>
      </StSpace>
      <Teleport to="body">
         <!-- 常驻挂载预加载：iframe 提前加载预览页，进入全屏时内容已就绪，不会黑屏 -->
         <div
            v-show="fullScreenMode"
            class="fixed z-[10000] overflow-hidden border border-accent-500 bg-[#1F1F1F]"
            :style="fullscreenStyle">
            <StSpace
               @click="leaveFullScreenMode"
               center
               no-shrink
               class="size-[3rem] rounded-full bg-accent-600 text-accent-200 opacity-50 absolute hover:opacity-80 transition-opacity cursor-pointer right-4 top-4 z-[10001]">
               <OffScreen />
            </StSpace>
            <iframe v-if="iframeSrc" :src="iframeSrc" class="size-full"></iframe>
         </div>
      </Teleport>
   </StSpace>
</template>

<style lang="css" src="@/assets/css/utils.css" />
