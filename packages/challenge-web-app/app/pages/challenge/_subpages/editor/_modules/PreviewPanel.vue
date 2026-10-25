<script setup lang="ts">
import {
   Check,
   CheckOne,
   FullScreenTwo,
   LoadingFour,
   OffScreen,
   Refresh,
   Round,
   Terminal,
   WholeSiteAccelerator,
} from '@icon-park/vue-next';
import EditorEnvError from '../_components/EditorEnvError.vue';
import ConsolePanel from './ConsolePanel.vue';
import { usePreviewConsole } from '../_composables/use-preview-console';
import { MIN_PANEL_PERCENT, clampPercent } from '~/components/st/SplitPanel/layout-math';
import { useLayoutStore } from '~/stores/layout-store';
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

/** 移动端（与布局层 max-md: 断点一致） */
const isMobile = useMediaQuery('(max-width: 767px)');

const FULLSCREEN_TARGET = {
   left: '2rem',
   top: '2rem',
   width: 'calc(100vw - 4rem)',
   height: 'calc(100vh - 4rem)',
   borderRadius: '0.75rem',
};
const FULLSCREEN_TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

/**
 * 移动端横屏全屏目标：rotate(90deg) 把预览转成横屏。
 * 变换以左上角为原点、锚在 left:100%，宽取 100dvh、高取 100dvw，
 * 旋转后恰好铺满整个竖屏视口（无四周间隔、无圆角）。
 */
const MOBILE_LANDSCAPE_TARGET = {
   left: '100%',
   top: '0px',
   width: '100dvh',
   height: '100dvw',
   transform: 'rotate(90deg)',
   transformOrigin: 'top left',
   borderRadius: '0px',
};

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
   // 移动端：直接切到横屏全屏（旋转铺满视口，无间隔），不做飞入动画
   if (isMobile.value) {
      fullScreenMode.value = true;
      fullscreenStyle.value = {
         ...MOBILE_LANDSCAPE_TARGET,
         opacity: '1',
         pointerEvents: 'auto',
         transition: 'none',
      };
      return;
   }
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
   // 移动端：直接退出，不回放飞回动画
   if (isMobile.value) {
      fullScreenMode.value = false;
      return;
   }
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

const inlineIframeRef = useTemplateRef<HTMLIFrameElement>('inline-iframe');
const previewConsole = usePreviewConsole({
   getTarget: () => inlineIframeRef.value?.contentWindow,
});
watch(iframeSrc, previewConsole.reset);

const consoleOpen = ref(false);
const toggleConsole = () => {
   consoleOpen.value = !consoleOpen.value;
};

const CONSOLE_STORAGE_KEY = 'editor.preview-console';
const CONSOLE_DEFAULT_PERCENT = 35;
const layoutStore = useLayoutStore();
const consoleDragPercent = ref<number | null>(null);
const consolePercent = computed(
   () =>
      consoleDragPercent.value ??
      layoutStore.getPanelSize(CONSOLE_STORAGE_KEY, CONSOLE_DEFAULT_PERCENT),
);
const consoleDragging = computed(() => consoleDragPercent.value !== null);
const splitRef = useTemplateRef<HTMLElement>('split');

const startConsoleResize = (event: PointerEvent) => {
   // pointerdown 对触摸同样触发，仅响应主键（左键 / 触屏）
   if (event.button !== 0) return;
   const container = splitRef.value;
   if (!container) return;
   event.preventDefault();
   const rect = container.getBoundingClientRect();
   consoleDragPercent.value = consolePercent.value;

   const onPointerMove = (moveEvent: PointerEvent) => {
      const percent = ((rect.bottom - moveEvent.clientY) / rect.height) * 100;
      consoleDragPercent.value = clampPercent(
         percent,
         MIN_PANEL_PERCENT,
         100 - MIN_PANEL_PERCENT,
      );
   };
   const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.documentElement.style.cursor = '';
      if (consoleDragPercent.value !== null) {
         layoutStore.setPanelSize(CONSOLE_STORAGE_KEY, consoleDragPercent.value);
      }
      consoleDragPercent.value = null;
   };
   document.documentElement.style.cursor = 'row-resize';
   document.addEventListener('pointermove', onPointerMove);
   document.addEventListener('pointerup', onPointerUp);
   document.addEventListener('pointercancel', onPointerUp);
};
const resetConsoleSize = () => {
   layoutStore.setPanelSize(CONSOLE_STORAGE_KEY, CONSOLE_DEFAULT_PERCENT);
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

defineExpose({ refresh, toggleConsole });
</script>

<template>
   <StSpace fill direction="vertical" gap="0" class="rounded-xl max-md:rounded-none">
      <StSpace
         fill-x
         class="p-1 rounded-t-xl max-md:rounded-t-none bg-accent-600"
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
               @click="toggleConsole"
               center
               no-shrink
               :title="consoleOpen ? '隐藏控制台' : '打开控制台'"
               class="relative size-[2rem] rounded-[0.5rem] m-0.5 cursor-pointer transition-colors"
               :class="
                  consoleOpen
                     ? 'bg-secondary text-accent-500'
                     : 'bg-accent-500 text-accent-200'
               ">
               <Terminal />
               <span
                  v-if="!consoleOpen && previewConsole.counts.value.errors"
                  class="absolute top-1 right-1 size-1.5 rounded-full bg-red-400"></span>
            </StSpace>
         </StRippleEffect>
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
      <div ref="split" class="flex flex-col flex-1 min-h-0 w-full">
         <StSpace
            fill
            class="min-h-0 bg-[#1F1F1F] rounded-b-xl overflow-hidden border border-t-0 border-accent-600"
            :class="consoleOpen ? '' : 'max-md:rounded-b-none'"
            :style="consoleOpen ? { flex: `0 0 calc(${100 - consolePercent}% - 0.75rem)` } : undefined">
            <StSpace
               v-if="!props.previewUrl"
               direction="vertical"
               fill
               center
               :class="props.unsupportedReason ? '' : 'grayscale-100'">
               <IconLogo
                  v-if="!props.unsupportedReason"
                  class="w-[24rem] scale-[175%] opacity-50 mb-4 -mt-4" />
               <EditorEnvError v-if="props.unsupportedReason" :reason="props.unsupportedReason" />
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
               class="size-full bg-white"
               :style="{ opacity: fullScreenMode ? 0 : 1 }">
               <iframe
                  ref="inline-iframe"
                  :src="iframeSrc"
                  class="size-full bg-white"
                  :style="{ pointerEvents: consoleDragging ? 'none' : undefined }"></iframe>
            </div>
         </StSpace>
         <template v-if="consoleOpen">
            <div
               role="separator"
               aria-orientation="horizontal"
               aria-label="预览与控制台分隔条"
               title="拖动调整控制台高度；双击恢复默认"
               class="flex items-center justify-center w-full h-1 my-1 shrink-0 rounded-full hover:bg-secondary group transition-colors cursor-row-resize"
               :class="{ '!bg-secondary': consoleDragging }"
               style="touch-action: none"
               @pointerdown.left="startConsoleResize"
               @dblclick="resetConsoleSize">
               <div
                  class="w-8 h-1 rounded-xl bg-accent-600 group-hover:bg-primary transition-colors"
                  :class="{ '!bg-primary': consoleDragging }"></div>
            </div>
            <div class="min-h-0" :style="{ flex: `0 0 ${consolePercent}%` }">
               <ConsolePanel
                  :entries="previewConsole.entries.value"
                  :ready="previewConsole.ready.value"
                  :counts="previewConsole.counts.value"
                  @execute="previewConsole.execute"
                  @clear="previewConsole.clear"
                  @close="consoleOpen = false" />
            </div>
         </template>
      </div>
      <Teleport to="body">
         <div
            v-show="fullScreenMode"
            class="fixed z-[10000] overflow-hidden bg-[#1F1F1F] border border-accent-500 max-md:border-0"
            :style="fullscreenStyle">
            <StSpace
               @click="leaveFullScreenMode"
               center
               no-shrink
               class="size-[3rem] rounded-full bg-accent-600 text-accent-200 opacity-50 absolute hover:opacity-80 transition-opacity cursor-pointer right-4 top-4 z-[10001]">
               <OffScreen />
            </StSpace>
            <iframe v-if="iframeSrc" :src="iframeSrc" class="size-full bg-white"></iframe>
         </div>
      </Teleport>
   </StSpace>
</template>

<style lang="css" src="@/assets/css/utils.css" />
