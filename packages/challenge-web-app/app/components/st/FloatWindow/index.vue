<script setup lang="ts">
import { useResizable } from '~/composables/use-resizable';

const props = defineProps<{
   initialSize?: {
      width: number;
      height: number;
   };
   initialPosition?: {
      x: number;
      y: number;
   };
   closable?: boolean;
}>();

// drag control
const draggableHandle = useTemplateRef('draggableHandle');
const { x, y, isDragging } = useDraggable(draggableHandle, {
   initialValue: {
      x: props.initialPosition?.x ?? 100,
      y: props.initialPosition?.y ?? 100,
   },
});
const containerTranslate = computed(() => {
   return `translate(${x.value}px, ${y.value}px)`;
});

// resize control
const resizeHandle = useTemplateRef('resizableHandle');
const { width, height, isResizing } = useResizable(resizeHandle, {
   initialWidth: props.initialSize?.width ?? 400,
   initialHeight: props.initialSize?.height ?? 500,
   minHeight: 150,
   minWidth: 200,
});

// status
const isActive = defineModel<boolean>('isActive', {
   default: true,
});
</script>

<template>
   <Teleport to="body">
      <StSpace
         class="w-screen h-screen fixed left-0 top-0 z-[9999] overflow-hidden"
         :class="{
            'pointer-events-none': !isDragging && !isResizing,
         }">
         <Transition name="fade">
            <StSpace
               v-show="isActive"
               direction="vertical"
               gap="0"
               class="relative left-0 top-0 bg-[#1C1C1C] rounded-xl z-[9999] border border-accent-500 text-white shadow-lg shadow-background pointer-events-auto transition-colors"
               :style="{
                  transform: containerTranslate,
                  width: `${width}px`,
                  height: `${height}px`,
               }">
               <div
                  ref="draggableHandle"
                  style="touch-action: none"
                  class="w-full h-12 bg-accent-600 rounded-t-xl hover:cursor-move">
                  <slot name="tools"></slot>
               </div>
               <slot></slot>
               <div
                  ref="resizableHandle"
                  style="touch-action: none"
                  class="cursor-se-resize absolute right-0 bottom-0 border-r-2 border-b-2 border-secondary size-4 hover:size-5 rounded-br-xl hover:border-r-4 hover:border-b-4 hover:translate-0.5 transition-all"></div>
            </StSpace>
         </Transition>
      </StSpace>
   </Teleport>
</template>

<style lang="css" scoped>
.fade-enter-active,
.fade-leave-active {
   transition: opacity 0.1s, scale 0.1s;
}

.fade-enter-from,
.fade-leave-to {
   opacity: 0;
   scale: 0.95;
}
</style>
