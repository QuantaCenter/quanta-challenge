<script setup lang="ts">
import type { CSSProperties } from 'vue';

const props = withDefaults(defineProps<{
   percentage: number;
   /** 数字按 px 处理，也可以传入 rem、vw 等 CSS 长度。 */
   size?: number | string;
   /** 相对于 100 × 100 viewBox 的线宽，随尺寸等比例缩放。 */
   strokeWidth?: number;
   labelPosition?: 'center' | 'top' | 'right' | 'bottom' | 'left';
   showPercentage?: boolean;
   precision?: number;
   color?: string;
   /** 进度满（100%）时进度环使用的颜色；传空字符串则始终使用 `color`。 */
   completeColor?: string;
   trackColor?: string;
   linecap?: 'round' | 'butt' | 'square';
   startAngle?: number;
   clockwise?: boolean;
   animated?: boolean;
   animateOnMount?: boolean;
   duration?: number;
   labelSize?: number | string;
   gap?: number | string;
   label?: string;
}>(), {
   size: 96,
   strokeWidth: 8,
   labelPosition: 'center',
   showPercentage: true,
   precision: 0,
   color: 'var(--color-primary)',
   completeColor: 'var(--color-success)',
   trackColor: 'var(--color-accent-500)',
   linecap: 'round',
   startAngle: -90,
   clockwise: true,
   animated: true,
   animateOnMount: false,
   duration: 500,
   gap: 8,
   label: '进度',
});

const percentage = computed(() => Number.isFinite(props.percentage)
   ? Math.min(100, Math.max(0, props.percentage)) : 0);
const strokeWidth = computed(() => Number.isFinite(props.strokeWidth)
   ? Math.min(50, Math.max(1, props.strokeWidth)) : 8);
const radius = computed(() => (100 - strokeWidth.value) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const precision = computed(() => Number.isFinite(props.precision)
   ? Math.min(4, Math.max(0, Math.trunc(props.precision))) : 0);
const text = computed(() => `${percentage.value.toFixed(precision.value)}%`);
// 按目标进度判断：动画期间颜色随进度环一起过渡，而不是等到走完才突变
const ringColor = computed(() =>
   percentage.value >= 100 && props.completeColor ? props.completeColor : props.color);
const cssLength = (value: number | string) => typeof value === 'number' ? `${value}px` : value;
const dimension = computed(() => typeof props.size === 'number'
   ? cssLength(Number.isFinite(props.size) && props.size > 0 ? props.size : 96)
   : props.size);
const ready = ref(!props.animateOnMount);
const visiblePercentage = computed(() => props.animated && !ready.value ? 0 : percentage.value);
const offset = computed(() => circumference.value * (1 - visiblePercentage.value / 100));
const ringStyle = computed<CSSProperties>(() => ({
   width: dimension.value,
   height: dimension.value,
}));
const labelStyle = computed<CSSProperties>(() => ({
   fontSize: props.labelSize === undefined
      ? props.labelPosition === 'center' ? '18px' : '14px'
      : cssLength(props.labelSize),
}));
const progressStyle = computed<CSSProperties>(() => ({
   transitionDuration: `${props.animated && Number.isFinite(props.duration) ? Math.max(0, props.duration) : 0}ms`,
}));

let firstFrame = 0;
let secondFrame = 0;
onMounted(() => {
   if (ready.value) return;
   firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => { ready.value = true; });
   });
});
onBeforeUnmount(() => {
   cancelAnimationFrame(firstFrame);
   cancelAnimationFrame(secondFrame);
});
</script>

<template>
   <div
      role="progressbar"
      :aria-label="label"
      :aria-valuenow="percentage"
      :aria-valuetext="text"
      :aria-valuemin="0"
      :aria-valuemax="100"
      class="inline-flex shrink-0 items-center justify-center align-middle"
      :class="{
         'flex-col-reverse': labelPosition === 'top',
         'flex-col': labelPosition === 'bottom',
         'flex-row-reverse': labelPosition === 'left',
         'flex-row': labelPosition === 'right' || labelPosition === 'center',
      }"
      :style="{ gap: showPercentage && labelPosition !== 'center' ? cssLength(gap) : '0' }">
      <div class="relative shrink-0" :style="ringStyle">
         <svg viewBox="0 0 100 100" class="block h-full w-full overflow-visible" aria-hidden="true">
            <circle
               cx="50"
               cy="50"
               :r="radius"
               fill="none"
               :stroke="trackColor"
               :stroke-width="strokeWidth" />
            <g :transform="`rotate(${Number.isFinite(startAngle) ? startAngle : -90} 50 50)`">
               <circle
                  cx="50"
                  cy="50"
                  :r="radius"
                  fill="none"
                  :stroke="ringColor"
                  :stroke-width="strokeWidth"
                  :stroke-linecap="linecap"
                  :stroke-dasharray="circumference"
                  :stroke-dashoffset="offset"
                  :transform="clockwise ? undefined : 'translate(0 100) scale(1 -1)'"
                  :opacity="visiblePercentage === 0 ? 0 : 1"
                  :style="progressStyle"
                  class="transition-[stroke-dashoffset,opacity,stroke] ease-out motion-reduce:transition-none" />
            </g>
         </svg>
         <span
            v-if="showPercentage && labelPosition === 'center'"
            class="pointer-events-none absolute inset-0 flex items-center justify-center font-family-manrope tabular-nums text-accent-100"
            :style="labelStyle">
            <slot name="label" :percentage="percentage" :text="text">
               {{ text }}
            </slot>
         </span>
      </div>
      <span
         v-if="showPercentage && labelPosition !== 'center'"
         class="font-family-manrope tabular-nums text-accent-100"
         :style="labelStyle">
         <slot name="label" :percentage="percentage" :text="text">
            {{ text }}
         </slot>
      </span>
   </div>
</template>
