<script setup lang="ts">
import { Refresh, ShareThree } from '@icon-park/vue-next';
import {
   CHALLENGE_EMBED_MESSAGE_SOURCE,
   toChallengeEmbedUrl,
   type TChallengeEmbedMessage,
} from '~/composables/use-challenge-embed';

/** 题目小节里的内嵌做题区：iframe 加载嵌入模式的做题页，并保留新窗口打开的入口。 */
const props = defineProps<{ pid: number; title: string }>();
const emit = defineEmits<{ committed: [recordId: number] }>();

type TStatus = 'pending' | 'ready' | 'mobile' | 'unsupported';

/** 防止跨源隔离始终无法生效时反复刷新 */
const COI_RELOAD_KEY = 'learning-coi-reloaded';

const status = ref<TStatus>('pending');
const loaded = ref(false);
const frameKey = ref(0);
const frame = useTemplateRef<HTMLIFrameElement>('frame');

const standaloneUrl = computed(() => `/challenge/editor/${props.pid}`);
const embedUrl = computed(() => toChallengeEmbedUrl(standaloneUrl.value));

onMounted(() => {
   if (window.matchMedia('(max-width: 767px)').matches) {
      status.value = 'mobile';
      return;
   }
   // 应用内跳转进来时文档沿用的是上一页的响应头，需整页刷新一次才能拿到 COOP/COEP
   if (!window.crossOriginIsolated) {
      if (!sessionStorage.getItem(COI_RELOAD_KEY)) {
         sessionStorage.setItem(COI_RELOAD_KEY, '1');
         window.location.reload();
         return;
      }
      status.value = 'unsupported';
      return;
   }
   sessionStorage.removeItem(COI_RELOAD_KEY);
   status.value = 'ready';
});

const reload = () => {
   loaded.value = false;
   frameKey.value += 1;
};

useEventListener(window, 'message', (event: MessageEvent) => {
   if (event.origin !== window.location.origin) return;
   if (!frame.value || event.source !== frame.value.contentWindow) return;
   const data = event.data as Partial<TChallengeEmbedMessage> | null;
   if (data?.source !== CHALLENGE_EMBED_MESSAGE_SOURCE) return;
   if (data.type === 'committed' && typeof data.recordId === 'number') {
      emit('committed', data.recordId);
   }
});
</script>

<template>
   <section class="flex w-full flex-col overflow-hidden rounded-xl border border-accent-500 bg-[#111111]">
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-accent-500 bg-accent-600 pl-4 pr-2">
         <span class="shrink-0 text-sm text-accent-100">在线做题</span>
         <span class="truncate text-xs text-accent-300">#{{ pid }} {{ title }}</span>
         <div class="ml-auto flex shrink-0 items-center gap-1">
            <StPopover v-if="status === 'ready'" content="重新加载" placement="top" class="shrink-0">
               <button
                  type="button"
                  aria-label="重新加载"
                  class="flex size-8 cursor-pointer items-center justify-center rounded-md text-accent-300 transition-colors hover:bg-accent-500 hover:text-white"
                  @click="reload">
                  <Refresh />
               </button>
            </StPopover>
            <StPopover content="在新窗口打开完整做题页" placement="top" class="shrink-0">
               <a
                  :href="standaloneUrl"
                  target="_blank"
                  rel="noopener"
                  aria-label="在新窗口打开"
                  class="flex size-8 items-center justify-center rounded-md text-accent-300 transition-colors hover:bg-accent-500 hover:text-white">
                  <ShareThree />
               </a>
            </StPopover>
         </div>
      </header>

      <div class="relative h-[min(80vh,48rem)] min-h-[32rem] w-full">
         <iframe
            v-if="status === 'ready'"
            ref="frame"
            :key="frameKey"
            :src="embedUrl"
            :title="`在线做题：${title}`"
            allow="cross-origin-isolated; clipboard-read; clipboard-write"
            class="block size-full border-0"
            @load="loaded = true"></iframe>

         <div
            v-if="status === 'pending' || (status === 'ready' && !loaded)"
            class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-accent-300">
            正在加载做题环境…
         </div>

         <div
            v-else-if="status !== 'ready'"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p class="max-w-md text-sm leading-relaxed text-accent-300">
               {{
                  status === 'mobile'
                     ? '小屏设备不适合内嵌做题，请在完整做题页中完成练习。'
                     : '当前页面未处于跨源隔离状态，无法内嵌在线开发环境，请在完整做题页中完成练习。'
               }}
            </p>
            <a
               :href="standaloneUrl"
               target="_blank"
               rel="noopener"
               class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm text-white transition-opacity hover:opacity-80">
               前往做题
               <ShareThree aria-hidden="true" />
            </a>
         </div>
      </div>
   </section>
</template>
