<script setup lang="ts">
import { ClickToFold } from '@icon-park/vue-next';
import { ExternalLink, PanelsTopLeft } from 'lucide-vue-next';
import { openProblemDesignWindow } from '~/utils/open-problem-design-window';

const props = defineProps<{ problemId: number; problemTitle?: string }>();
const editorStore = useEditorStore();
const path = computed(() => `/design/${props.problemId}`);
const title = computed(() => props.problemTitle ? `${props.problemTitle} · 设计稿` : '设计稿');
const designFrame = useTemplateRef<HTMLIFrameElement>('design-frame');
const loaded = ref(editorStore.designWindowOpened);
watch(
   () => editorStore.designWindowOpened,
   () => { loaded.value = true; },
   { once: true },
);

const viewportWidth = import.meta.client ? window.innerWidth : 1200;
const viewportHeight = import.meta.client ? window.innerHeight : 800;
const initialSize = {
   width: Math.min(1050, Math.max(200, viewportWidth - 104)),
   height: Math.min(660, Math.max(150, viewportHeight - 84)),
};
const initialPosition = { x: 88, y: 32 };
const actionClass = 'm-0.5 grid size-8 place-items-center rounded-lg bg-accent-500 text-accent-200 transition-colors hover:cursor-pointer hover:bg-accent-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
</script>

<template>
   <StFloatWindow
      v-model:is-active="editorStore.designWindowOpened"
      :initial-size="initialSize"
      :initial-position="initialPosition"
      :interaction-frame="designFrame"
      raise-on-interact>
      <template #tools>
         <div class="flex h-full min-w-0 items-center gap-1 px-1">
            <PanelsTopLeft :size="16" class="ml-2 mr-1 shrink-0 text-accent-200" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="title">{{ title }}</span>
            <StPopover content="在新窗口打开设计稿" placement="bottom" :z-index="10001" class="flex shrink-0" tooltip>
               <NuxtLink
                  :to="path"
                  target="_blank"
                  rel="noopener"
                  aria-label="在新窗口打开设计稿"
                  :class="actionClass"
                  @click.prevent="openProblemDesignWindow(path)"
                  @pointerdown.stop>
                  <ExternalLink :size="16" />
               </NuxtLink>
            </StPopover>
            <StPopover content="关闭设计稿" placement="bottom" :z-index="10001" class="flex shrink-0" tooltip>
               <button
                  type="button"
                  aria-label="关闭设计稿"
                  :class="actionClass"
                  @pointerdown.stop
                  @click="editorStore.designWindowOpened = false">
                  <ClickToFold aria-hidden="true" />
               </button>
            </StPopover>
         </div>
      </template>
      <template #default="{ isInteracting }">
         <iframe
            v-if="loaded"
            ref="design-frame"
            :src="`${path}?embed=1`"
            title="设计稿查看器"
            allow="clipboard-write"
            class="min-h-0 w-full flex-1 rounded-b-xl border-0"
            :class="{ 'pointer-events-none': isInteracting }" />
      </template>
   </StFloatWindow>
</template>
