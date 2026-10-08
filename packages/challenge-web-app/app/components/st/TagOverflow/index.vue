<script setup lang="ts">
import type { ITagOverflowItem } from './type';

/**
 * 单行标签溢出省略。
 *
 * 容器宽度放不下的标签会被收成 `+N`。做法与 `ProblemCard/Tags` 一致：
 * 在一个隐藏的「量尺」里渲染全部标签 + 计数器来量宽，可见层只渲染放得下的部分。
 * 相比前者，这里把标签样式交给调用方（`item.class`），因此不绑定具体的 StTag 配色。
 */
const props = withDefaults(
   defineProps<{
      items: ITagOverflowItem[];
      /** 标签间距（px） */
      gap?: number;
      /** `+N` 计数器的样式类 */
      counterClass?: string;
   }>(),
   { gap: 6 },
);

const measureRef = useTemplateRef<HTMLElement>('measure');
const containerRef = useTemplateRef<HTMLElement>('container');
/** 可见标签数量：先全量渲染（SSR 不丢内容），挂载后再按宽度收敛 */
const visibleCount = ref(props.items.length);

const recalc = () => {
   const measure = measureRef.value;
   const container = containerRef.value;
   if (!measure || !container) return;

   const width = container.clientWidth;
   if (width <= 0) return;

   const children = Array.from(measure.children) as HTMLElement[];
   const itemEls = children.slice(0, props.items.length);
   const counterEl = children[props.items.length];
   if (!counterEl || itemEls.length === 0) {
      visibleCount.value = props.items.length;
      return;
   }

   const gap = props.gap;
   const counterWidth = counterEl.getBoundingClientRect().width;
   let used = 0;
   let count = 0;
   for (let i = 0; i < itemEls.length; i++) {
      const itemWidth = itemEls[i]!.getBoundingClientRect().width;
      const next = used + (i > 0 ? gap : 0) + itemWidth;
      // 若后面还有标签放不下，就得给 `+N` 留出位置
      const hasMore = i < itemEls.length - 1;
      const required = hasMore ? next + gap + counterWidth : next;
      if (required > width) break;
      used = next;
      count = i + 1;
   }
   visibleCount.value = count;
};

onMounted(() => {
   requestAnimationFrame(recalc);
   if (!containerRef.value) return;
   const observer = new ResizeObserver(recalc);
   observer.observe(containerRef.value);
   onBeforeUnmount(() => observer.disconnect());
});

watch(
   () => props.items,
   () => nextTick(recalc),
   { deep: true },
);
</script>

<template>
   <div ref="container" class="relative w-full min-w-0">
      <!-- 量尺：全部标签 + 计数器，仅用于量宽（不占位、不可见） -->
      <div
         ref="measure"
         aria-hidden="true"
         class="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-nowrap"
         :style="{ gap: `${gap}px` }">
         <span
            v-for="item in items"
            :key="item.key"
            class="shrink-0 whitespace-nowrap"
            :class="item.class">
            {{ item.label }}
         </span>
         <span class="shrink-0 whitespace-nowrap" :class="counterClass">
            +{{ items.length }}
         </span>
      </div>

      <!-- 可见层：只渲染放得下的标签，其余收成 +N -->
      <div class="flex flex-nowrap overflow-hidden" :style="{ gap: `${gap}px` }">
         <span
            v-for="item in items.slice(0, visibleCount)"
            :key="item.key"
            class="shrink-0 whitespace-nowrap"
            :class="item.class">
            {{ item.label }}
         </span>
         <span
            v-if="visibleCount < items.length"
            class="shrink-0 whitespace-nowrap"
            :class="counterClass">
            +{{ items.length - visibleCount }}
         </span>
      </div>
   </div>
</template>
