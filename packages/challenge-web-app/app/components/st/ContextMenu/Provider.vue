<script setup lang="ts">
import {
   ContextMenuButton,
   type ContextMenuPosition,
   type ContextMenuProvideValue,
   type ContextMenuStatus,
} from './type';

const props = defineProps<{
   mouseButton?: ContextMenuButton;
   contextKey?: string | symbol;
}>();

const menuStatus = ref<ContextMenuStatus>('closed');
const menuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 });
const targetElement = ref<HTMLElement | null>(null);
provide<ContextMenuProvideValue>(props.contextKey ?? '__clickMenu', {
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
   // 捕获阶段关闭菜单，避免文件树等子节点的 click.stop 阻断关闭逻辑。
   // 不阻止默认行为，保留文件选择器、链接等控件的正常点击。
   const onClickGlobal = () => {
      menuStatus.value = 'closed';
   };
   const onContextMenuGlobal = (event: MouseEvent) => event.preventDefault();

   area.value.addEventListener('mousedown', onMouseDown);
   area.value.addEventListener('contextmenu', onContextMenu);
   document.addEventListener('click', onClickGlobal, true);
   document.addEventListener('contextmenu', onContextMenuGlobal);

   onBeforeUnmount(() => {
      area.value!.removeEventListener('mousedown', onMouseDown);
      area.value!.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('click', onClickGlobal, true);
      document.removeEventListener('contextmenu', onContextMenuGlobal);
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
