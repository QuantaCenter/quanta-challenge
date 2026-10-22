<script setup lang="ts">
import { ClickToFold, ZoomIn, ZoomOut } from '@icon-park/vue-next';
import { useMarkdown } from '~/composables/use-markdown';

const props = defineProps<{
   markdown?: string;
}>();

const editorStore = useEditorStore();
const close = () => {
   editorStore.detailWindowOpened = false;
};

const { html, update } = useMarkdown();
onMounted(() => {
   props.markdown && update(props.markdown);
});
watch(
   () => props.markdown,
   (newMarkdown) => {
      newMarkdown && update(newMarkdown);
   }
);

const fontSize = ref(12);
const zoomIn = () => {
   if (fontSize.value < 36) {
      fontSize.value += 1;
   }
};
const zoomOut = () => {
   if (fontSize.value > 8) {
      fontSize.value -= 1;
   }
};
</script>

<template>
   <StFloatWindow v-model:is-active="editorStore.detailWindowOpened">
      <template #tools>
         <StSpace
            align="center"
            fill
            gap="0.2rem"
            justify="end"
            class="px-1 pointer-events-none">
            <StPopover content="缩小字体" :z-index="10001" placement="bottom">
               <StSpace
                  @click.prevent="zoomOut"
                  @mousedown.prevent
                  center
                  class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 hover:cursor-pointer hover:bg-accent-400 transition-colors pointer-events-auto">
                  <ZoomOut />
               </StSpace>
            </StPopover>
            <StPopover content="放大字体" :z-index="10001" placement="bottom">
               <StSpace
                  @click.prevent="zoomIn"
                  @mousedown.prevent
                  center
                  class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 hover:cursor-pointer hover:bg-accent-400 transition-colors pointer-events-auto">
                  <ZoomIn />
               </StSpace>
            </StPopover>
            <StPopover content="关闭" :z-index="10001" placement="bottom">
               <StSpace
                  @click.prevent="close"
                  @mousedown.prevent
                  center
                  class="size-[2rem] rounded-[0.5rem] m-0.5 text-accent-200 bg-accent-500 hover:cursor-pointer hover:bg-accent-400 transition-colors pointer-events-auto">
                  <ClickToFold />
               </StSpace>
            </StPopover>
         </StSpace>
      </template>
      <StSpace
         direction="vertical"
         class="size-full overflow-auto p-4 hide-scrollbar transition-all"
         :style="{
            fontSize: `${fontSize}px`,
         }">
         <LazyStMarkdownPreview :html="html" class="w-full" />
      </StSpace>
   </StFloatWindow>
</template>
