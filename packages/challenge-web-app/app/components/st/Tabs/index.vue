<script setup lang="ts">
import type { DefineComponent } from 'vue';

const props = defineProps<{
   options: { label: string; value: string; icon?: DefineComponent }[];
}>();

const value = defineModel<string>();
const tabWidths = ref<number[]>([]);

const currentIndex = computed(() =>
   props.options.findIndex((opt) => opt.value === value.value),
);
const currentLeft = computed(() => {
   return tabWidths.value
      .slice(0, Math.max(currentIndex.value, 0))
      .reduce((a, b) => a + b, 0);
});
const currentWidth = computed(() => tabWidths.value[currentIndex.value] ?? 0);

const tabs = useTemplateRefsList<{ $el: HTMLElement }>();

/** 重测页签宽度：原实现只测一次，文案一变下划线就错位。 */
const measure = () => {
   const next = tabs.value.map(
      (tab) => tab?.$el?.getBoundingClientRect().width ?? 0,
   );
   const unchanged =
      next.length === tabWidths.value.length &&
      next.every(
         (width, index) => Math.abs(width - (tabWidths.value[index] ?? 0)) < 0.5,
      );
   if (!unchanged) tabWidths.value = next;
};

let frame = 0;
const scheduleMeasure = () => {
   cancelAnimationFrame(frame);
   frame = requestAnimationFrame(measure);
};

/** 观察页签自身而不是容器：容器是 w-full，页签变宽它不会收到通知。 */
let observer: ResizeObserver | null = null;
const observeTabs = () => {
   if (!observer) return;
   for (const tab of tabs.value) {
      if (tab?.$el) observer.observe(tab.$el);
   }
};

// 选项变化（增删页签）时，旧元素不再需要观察，直接重来一轮
watch(
   () => props.options.map((option) => option.label),
   () => {
      observer?.disconnect();
      scheduleMeasure();
      observeTabs();
   },
   { flush: 'post' },
);

onMounted(() => {
   // 选中项已失效才回落到第一个，别冲掉调用方刚设好的选中项。
   if (!props.options.some((option) => option.value === value.value)) {
      value.value = props.options[0]?.value;
   }

   observer = new ResizeObserver(scheduleMeasure);
   observeTabs();
});

onUnmounted(() => {
   cancelAnimationFrame(frame);
   observer?.disconnect();
});
</script>

<template>
   <StSpace fill-x class="relative border-b border-b-accent-500" gap="0">
      <div
         class="absolute bg-primary bottom-0 left-0 h-[1px] translate-y-[1px] transition-all"
         :style="{
            left: `${currentLeft}px`,
            width: `${currentWidth}px`,
         }"></div>
      <StSpace
         v-for="tab in props.options"
         :key="tab.value"
         :ref="tabs.set"
         :class="{
            'text-accent-300': tab.value !== value,
            'text-primary': tab.value === value,
         }"
         class="px-6 py-2 cursor-pointer transition-all"
         align="center"
         @click="value = tab.value">
         <Component v-if="tab.icon" :is="tab.icon" class="text-lg mr-2" />
         {{ tab.label }}
      </StSpace>
   </StSpace>
</template>
