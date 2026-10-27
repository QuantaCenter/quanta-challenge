<script setup lang="ts">
import {
   ContextMenuButton,
   type ContextMenuPosition,
   type ContextMenuProvideValue,
   type ContextMenuStatus,
} from './type';

const props = defineProps<{
   mouseButton?: ContextMenuButton;
   key?: string | symbol;
}>();

const menuStatus = ref<ContextMenuStatus>('closed');
const menuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 });
const targetElement = ref<HTMLElement | null>(null);
provide<ContextMenuProvideValue>(props.key ?? '__clickMenu', {
   status: menuStatus,
   position: menuPosition,
   targetElement,
});

const area = useTemplateRef('area');
onMounted(() => {
   if (!area.value) return;

   const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
   };
   const onMouseDown = (e: MouseEvent) => {
      if (
         (props.mouseButton && e.button !== props.mouseButton) ||
         e.button !== ContextMenuButton.RIGHT
      ) {
         return;
      }

      if (e.target && area.value?.contains(e.target as Node)) {
         e.preventDefault();
         menuPosition.value = { x: e.clientX, y: e.clientY };
         menuStatus.value = 'opened';
         targetElement.value = e.target as HTMLElement;
      } else {
         menuStatus.value = 'closed';
      }
   };
   const onClickGlobal = (e: MouseEvent) => {
      e.preventDefault();
      menuStatus.value = 'closed';
   };

   area.value.addEventListener('mousedown', onMouseDown);
   area.value.addEventListener('contextmenu', onContextMenu);
   document.addEventListener('click', onClickGlobal);
   document.addEventListener('contextmenu', (e) => e.preventDefault());

   onBeforeUnmount(() => {
      area.value!.removeEventListener('mousedown', onMouseDown);
      area.value!.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('click', onClickGlobal);
   });
});
const teleported = useClientTeleport();
</script>

<template>
   <div ref="area">
      <Teleport to="body">
         <template v-if="teleported">
            <slot name="menu" :status="menuStatus" :position="menuPosition" />
         </template>
      </Teleport>
      <slot></slot>
   </div>
</template>
