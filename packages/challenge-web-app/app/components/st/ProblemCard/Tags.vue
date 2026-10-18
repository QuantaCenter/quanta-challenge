<script setup lang="ts">
interface ITag {
   color?: string | null;
   name: string;
}

const props = defineProps<{
   tags: ITag[];
}>();

const containerRef = useTemplateRef('container');
const tagsRef = useTemplateRef('tags');
const gap = ref(6);
const lines = ref(1);

const displayedTags = ref<ITag[]>([]);

const initialize = () => {
   if (!containerRef.value || !tagsRef.value) return;
   const container = containerRef.value.$el as HTMLDivElement;
   const tags = Array.from(tagsRef.value.$el.children as HTMLDivElement[]);

   // 获取容器和标签元素，计算宽度
   let containerWidth = container.clientWidth;
   const tagWidths = tags.map((tag) => tag.clientWidth);
   const counterWidth = tagWidths.pop() || 0;

   if (containerWidth <= 0) {
      requestAnimationFrame(initialize);
      return;
   }

   // 重新计算显示的标签
   const calcDisplayedTags = () => {
      displayedTags.value = [];
      let totalWidth = 0;
      let totalLines = 0;
      const isLastLine = () => totalLines >= lines.value - 1;
      for (let i = 0; i < tagWidths.length; i++) {
         const expectedTotalWidth = totalWidth + tagWidths[i]!;
         if (isLastLine()) {
            const c1 =
               i !== tagWidths.length - 1 &&
               expectedTotalWidth + counterWidth + gap.value >= containerWidth;
            const c2 = expectedTotalWidth >= containerWidth;
            if (c1 || c2) break;
         } else if (expectedTotalWidth >= containerWidth) {
            totalLines++;
            totalWidth = 0;
            i -= 1;
            continue;
         }
         const t = props.tags.find((t) => t.name === tags[i]!.textContent)!;
         displayedTags.value.push(t);
         totalWidth = expectedTotalWidth + gap.value;
      }
   };
   calcDisplayedTags();

   // 监听容器大小变化，重新计算显示的标签
   const resizeObserver = new ResizeObserver(calcDisplayedTags);
   resizeObserver.observe(container);

   onBeforeUnmount(() => {
      resizeObserver.disconnect();
   });
};

onMounted(initialize);
</script>

<template>
   <StSpace fill-x align="center" gap="0.5rem">
      <div class="text-accent-200 text-nowrap whitespace-nowrap">标签</div>
      <StSpace fill-x>
         <StSpace
            ref="tags"
            fill-x
            :gap="`${gap}px`"
            class="top-0 left-0 !font-family-manrope bg-accent-100 pointer-events-none absolute opacity-0">
            <StTag
               v-for="tag in tags"
               size="small"
               :key="tag.name"
               :color="tag.color ?? void 0"
               :content="tag.name" />
            <StTag size="small" color="#6D6D6D" content="+00" />
         </StSpace>
         <StSpace
            fill-x
            ref="container"
            :gap="`${gap}px`"
            class="!font-family-manrope">
            <StTag
               v-for="tag in displayedTags"
               size="small"
               :key="tag.name"
               :color="tag.color ?? void 0"
               :content="tag.name" />
            <StTag
               v-if="displayedTags.length < tags.length"
               size="small"
               color="#6D6D6D"
               :content="`+${tags.length - displayedTags.length}`" />
         </StSpace>
      </StSpace>
   </StSpace>
</template>
