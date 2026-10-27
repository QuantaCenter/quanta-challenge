<script setup lang="ts">
import {
   TOGGLE_SLIDE_RADIO_INJECT_KEY,
   type ISlideRadioGroupOption,
} from './type';

const props = defineProps<{
   options: ISlideRadioGroupOption[];
}>();

const toggleSlideRadio = () => {};
provide(TOGGLE_SLIDE_RADIO_INJECT_KEY, toggleSlideRadio);

const selected = defineModel<any>('value');

const maskAttrs = reactive({
   width: 0,
   left: 0,
   color: '#00000000',
});

const container = useTemplateRef('container');
const updateMaskAttrs = (index: number) => {
   if (!container.value || !container.value.children) return;
   const item = container.value.children[index];
   if (!item) return;

   const widths: number[] = [];
   for (let i = 0; i < container.value.children.length - 1; i++) {
      widths.push(container.value.children[i]!.getBoundingClientRect().width);
   }

   maskAttrs.width = widths[index]!;
   maskAttrs.left =
      Array.from(container.value.children)
         .slice(0, index)
         .reduce((acc, el) => acc + el.getBoundingClientRect().width, 0) +
      index * 4;
   maskAttrs.color = props.options[index]?.color || '#00000000';
};

onMounted(() => {
   watchEffect(() => {
      const index = props.options.findIndex(
         (option) => option.value === selected.value
      );
      if (index === -1) return;
      updateMaskAttrs(index);
   });
});
</script>

<template>
   <div class="w-full p-1 rounded-lg border border-accent-300">
      <div ref="container" class="relative flex gap-1">
         <StSlideRadioGroupItem
            v-for="option in options"
            @click.prevent="selected = option.value"
            class="relative z-10"
            :selected="selected === option.value"
            :key="option.value"
            :option="option" />
         <div
            class="absolute h-full rounded-[0.25rem] top-0 z-0"
            :class="{ 'transition-all': maskAttrs.width > 0 }"
            :style="{
               width: maskAttrs.width + 'px',
               left: maskAttrs.left + 'px',
               backgroundColor: maskAttrs.color,
            }"></div>
      </div>
   </div>
</template>
