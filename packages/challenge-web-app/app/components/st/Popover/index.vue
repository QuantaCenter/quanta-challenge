<script setup lang="ts">
import { usePopper, type IUsePopperOptions } from '~/composables/use-popper';

const props = defineProps<{
   content?: string;
   placement?: NonNullable<IUsePopperOptions['options']>['placement'];
   zIndex?: number;
   /** 触屏上改为点击切换显示，点击外部收起；默认触屏不显示 */
   tapToggle?: boolean;
}>();

const { containerKey, popperKey, container, popper, popperInstance } = usePopper({
   options: {
      placement: props.placement ?? 'auto',
   },
});

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const triggered = ref(false);

// 服务端与水合期间内联渲染，挂载后再传送到 body（规避 teleport 水合错位）
const teleported = useClientTeleport();

// 用 pointer 事件区分输入类型：触屏点击会模拟 mouseenter 且没有对应的 leave，
// 提示会残留并可能撑大移动端布局视口，因此只响应鼠标 / 触控笔的悬停
const onPointerEnter = async (event: PointerEvent) => {
   if (event.pointerType === 'touch') return;
   triggered.value = true;
   await nextTick();
   popperInstance.value?.update();
};
const onPointerLeave = (event: PointerEvent) => {
   if (event.pointerType === 'touch') return;
   triggered.value = false;
};

// tapToggle：click 事件不一定带 pointerType，用最近一次 pointerdown 判断是否触屏点击
let lastPointerType = '';
const onPointerDown = (event: PointerEvent) => {
   lastPointerType = event.pointerType;
};
const onTap = async () => {
   if (lastPointerType !== 'touch') return;
   triggered.value = !triggered.value;
   if (!triggered.value) return;
   await nextTick();
   popperInstance.value?.update();
};
const onOutsidePointerDown = (event: PointerEvent) => {
   if (!triggered.value || event.pointerType !== 'touch') return;
   const target = event.target as Node | null;
   if (container.value?.contains(target) || popper.value?.contains(target)) return;
   triggered.value = false;
};

let observer: MutationObserver;
onMounted(() => {
   if (!container.value) return;
   container.value.addEventListener('pointerenter', onPointerEnter);
   container.value.addEventListener('pointerleave', onPointerLeave);
   if (props.tapToggle) {
      container.value.addEventListener('pointerdown', onPointerDown);
      container.value.addEventListener('click', onTap);
      document.addEventListener('pointerdown', onOutsidePointerDown, true);
   }
   observer = new MutationObserver(() => {
      popperInstance.value?.update();
   });
   observer.observe(container.value.parentNode!, {
      childList: true,
   });
   // pop content 卸载/重新挂载会改变 wrapper 尺寸，需重新定位
   if (popper.value) {
      observer.observe(popper.value, {
         childList: true,
         subtree: true,
      });
   }
   setTimeout(() => {
      popperInstance.value?.update();
   }, 200);
});
onUnmounted(() => {
   if (!container.value) return;
   container.value.removeEventListener('pointerenter', onPointerEnter);
   container.value.removeEventListener('pointerleave', onPointerLeave);
   container.value.removeEventListener('pointerdown', onPointerDown);
   container.value.removeEventListener('click', onTap);
   document.removeEventListener('pointerdown', onOutsidePointerDown, true);
   observer?.disconnect();
});
</script>

<template>
   <Teleport to="body">
      <template v-if="teleported">
         <div
            :ref="popperKey"
            v-show="triggered"
            class="absolute z-[10001] transition-opacity !w-fit"
            :class="[triggered ? 'opacity-100' : 'opacity-0 pointer-events-none']"
            :style="{ zIndex: props.zIndex ?? 9998 }">
            <slot name="popper" :triggered>
               <div class="px-2 py-1 rounded-lg bg-accent-600 text-white">
                  {{ content }}
               </div>
            </slot>
         </div>
      </template>
   </Teleport>
   <div :ref="containerKey" v-bind="attrs">
      <slot></slot>
   </div>
</template>
