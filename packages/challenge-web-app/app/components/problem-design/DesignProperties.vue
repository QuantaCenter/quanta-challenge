<script setup lang="ts">
import type { ProblemDesignNode } from '@challenge/judge-machine-agent/schemas';
import { Copy, Crosshair, ScanLine, SlidersHorizontal } from 'lucide-vue-next';
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui';
import { useMessage } from '~/components/st/Message/use-message';
import DesignCopyValue from './DesignCopyValue.vue';
import { createLengthFormatter, inspectAppearance, inspectShadows, inspectSpacing, inspectTypography, isNumericValue, type DesignUnit } from './design-inspection';

const props = defineProps<{ node?: ProblemDesignNode; rootFontSize: number }>();
const units = ['px', 'rem'] as const;
const unit = defineModel<DesignUnit>('unit', { default: 'px' });
const formatLength = computed(() => createLengthFormatter(unit.value, props.rootFontSize));
const geometryKeys = [['X', 'x'], ['Y', 'y'], ['宽度', 'width'], ['高度', 'height']] as const;
const boxSides = [
   { label: '上', key: 'top', classes: 'top-[3px] left-1/2 -translate-x-1/2' },
   { label: '右', key: 'right', classes: 'top-1/2 right-0 w-[12cqw] -translate-y-1/2' },
   { label: '下', key: 'bottom', classes: 'bottom-[3px] left-1/2 -translate-x-1/2' },
   { label: '左', key: 'left', classes: 'top-1/2 left-0 w-[12cqw] -translate-y-1/2' },
] as const;
const boxGroups = [
   { label: '外边距', key: 'margin', classes: 'inset-0 border-dashed border-[#946646] bg-[#473126] text-[#ffcfaa]' },
   { label: '边框', key: 'border', classes: 'inset-x-[12%] inset-y-[18px] border-[#988251] bg-[#48402a] text-[#fbe1a6]' },
   { label: '内边距', key: 'padding', classes: 'inset-x-[24%] inset-y-[36px] border-[#608d72] bg-[#293c32] text-[#bdebc9]' },
] as const;
const kinds = { frame: '容器', text: '文本', image: '图像', video: '视频', canvas: '画布', control: '控件', svg: '矢量', raster: '位图' };
const numberClass = 'font-family-manrope tabular-nums';
const message = useMessage();
let copyMessage: ReturnType<typeof message.success> | undefined;
let copyId = 0;

function formatDiagramLength(value: number) {
   return formatLength.value(value).slice(0, -(unit.value.length + 1));
}

async function copyValue(value: string, label: string) {
   const id = ++copyId;
   let success = false;
   try {
      await navigator.clipboard.writeText(value);
      success = true;
   } catch {
      // 浏览器可能禁止剪贴板写入，通过状态区反馈失败。
   }
   if (id !== copyId) return;
   copyMessage?.close();
   copyMessage = success
      ? message.success(`已复制${label}`, undefined, { duration: 1600, closable: false })
      : message.error('复制失败', '浏览器无法写入剪贴板');
}

const contentDimensions = computed(() => {
   const node = props.node;
   if (!node) return '';
   const box = node.localBox ?? node.box;
   const { border, padding } = node;
   const width = Math.max(0, box.width - border.left - border.right - padding.left - padding.right);
   const height = Math.max(0, box.height - border.top - border.bottom - padding.top - padding.bottom);
   return `${formatDiagramLength(width)} × ${formatDiagramLength(height)}`;
});

const styleGroups = computed(() => {
   const node = props.node;
   if (!node) return [];
   const format = formatLength.value;
   return [
      { label: '外观', rows: inspectAppearance(node, format) },
      { label: '排版', rows: inspectTypography(node, format) },
      { label: '布局间距', rows: inspectSpacing(node, format) },
      { label: '效果', rows: inspectShadows(node, format) },
   ].filter(group => group.rows.length);
});
const text = computed(() => props.node?.text);
</script>

<template>
   <aside class="flex min-h-0 min-w-0 flex-col bg-[#191919]" aria-label="元素信息">
      <div class="flex h-11 shrink-0 items-center justify-between gap-1.5 border-b border-white/10 px-2.5 sm:px-3.5">
         <h2 class="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
            <SlidersHorizontal :size="15" class="shrink-0 text-accent-300" aria-hidden="true" />
            <span class="truncate">元素信息</span>
         </h2>
         <RadioGroupRoot
            :model-value="unit"
            class="ml-auto flex shrink-0 items-center gap-px rounded-md bg-white/8 p-0.5"
            orientation="horizontal"
            aria-label="尺寸单位"
            @update:model-value="unit = $event === 'rem' ? 'rem' : 'px'">
            <RadioGroupItem
               v-for="option in units"
               :key="option"
               :value="option"
               class="h-6 rounded-sm px-1.5 text-xs font-normal text-accent-300 transition-colors hover:cursor-pointer hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary data-[state=checked]:bg-white/15 data-[state=checked]:text-white">
               {{ option }}
            </RadioGroupItem>
         </RadioGroupRoot>
         <slot name="header-actions" />
      </div>
      <div v-if="!node" class="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-accent-300">
         <Crosshair :size="22" />
         选择画布上的元素或左侧图层
      </div>
      <div v-else :key="node.id" class="min-h-0 flex-1 overflow-auto">
         <section class="space-y-1 border-b border-white/10 px-3.5 py-3.5">
            <h3 class="select-text break-all text-sm font-semibold" :class="isNumericValue(node.name || node.tag) ? numberClass : undefined">{{ node.name || node.tag }}</h3>
            <p class="select-text break-all text-xs text-accent-300">
               {{ kinds[node.kind] }}<template v-if="node.tag"> · {{ node.tag }}</template>
            </p>
         </section>
         <section class="space-y-3 border-b border-white/10 px-3.5 py-3.5">
            <h3 class="flex items-center gap-2 text-xs font-semibold">
               <ScanLine :size="14" class="text-accent-300" />
               位置与尺寸
            </h3>
            <div class="grid grid-cols-2 gap-1.5 text-xs tabular-nums">
               <DesignCopyValue
                  v-for="[label, key] in geometryKeys"
                  :key="key"
                  class="flex"
                  button-class="flex flex-wrap items-center justify-between gap-x-1 bg-white/5 px-2 py-1.5"
                  :label="label"
                  :value="formatLength(node.box[key])"
                  @copy="copyValue">
                  <span class="text-accent-300">{{ label }}</span>
                  <span class="wrap-anywhere" :class="numberClass">{{ formatLength(node.box[key]) }}</span>
               </DesignCopyValue>
            </div>
         </section>
         <section v-for="{ label, rows } in styleGroups" :key="label" class="space-y-2 border-b border-white/10 px-3.5 py-3.5">
            <h3 class="text-xs font-semibold">{{ label }}</h3>
            <div class="grid gap-1">
               <template v-for="(row, index) in rows" :key="index">
                  <div v-if="row.copyable === false" class="flex items-center justify-between gap-2 px-1.5 py-1 text-xs">
                     <span class="text-accent-300">{{ row.label }}</span>
                     <span class="flex items-center gap-2 text-right">
                        <span v-if="row.gradient" class="h-4 w-6 shrink-0 rounded-sm border border-white/20 bg-clip-padding" :style="{ backgroundImage: row.gradient }" aria-hidden="true" />
                        {{ row.value }}
                     </span>
                  </div>
                  <DesignCopyValue
                     v-else
                     :label="row.label"
                     :value="row.copyValue ?? row.value"
                     button-class="flex items-start justify-between gap-2 px-1.5 py-1 text-xs leading-5"
                     @copy="copyValue">
                     <span class="shrink-0 text-left text-accent-300">{{ row.label }}</span>
                     <span class="flex min-w-0 items-center gap-2 text-right">
                        <span
                           v-if="row.color"
                           class="size-4 shrink-0 overflow-hidden rounded-sm border border-white/20 bg-white/25 bg-clip-padding"
                           aria-hidden="true">
                           <span class="block size-full" :style="{ backgroundColor: row.color }" />
                        </span>
                        <span class="wrap-anywhere" :class="isNumericValue(row.value) ? numberClass : undefined">{{ row.value }}</span>
                     </span>
                  </DesignCopyValue>
               </template>
            </div>
         </section>
         <section v-if="node.kind !== 'text'" class="space-y-2 border-b border-white/10 px-3.5 py-3.5">
            <div class="flex items-baseline justify-between">
               <h3 class="text-xs font-semibold">盒模型</h3>
               <span class="text-xs text-accent-300">{{ unit }}</span>
            </div>
            <figure class="@container relative h-40 text-xs tabular-nums" aria-label="盒模型示意图">
               <div
                  v-for="{ label, key: group, classes } in boxGroups"
                  :key="group"
                  class="absolute border"
                  :class="classes"
                  role="group"
                  :aria-label="label">
                  <span class="absolute top-0 left-1 leading-4" aria-hidden="true">{{ label }}</span>
                  <DesignCopyValue
                     v-for="{ label: edgeLabel, key: side, classes: sideClasses } in boxSides"
                     :key="side"
                     class="absolute text-center leading-none"
                     :class="[sideClasses, numberClass, unit === 'rem' && (side === 'left' || side === 'right') && 'text-[10px]']"
                     :label="`${label}${edgeLabel}`"
                     :value="formatLength(node[group][side])"
                     button-class="truncate align-top"
                     @copy="copyValue">
                     {{ formatDiagramLength(node[group][side]) }}
                  </DesignCopyValue>
               </div>
               <div class="absolute inset-x-[36%] inset-y-[54px] grid place-content-center gap-0.5 border border-[#58769a] bg-[#263850] px-0.5 text-center leading-tight wrap-anywhere text-[#c9e2ff]">
                  <span>内容</span>
                  <DesignCopyValue
                     :class="numberClass"
                     button-class="px-0.5"
                     label="内容尺寸"
                     :value="`${contentDimensions} ${unit}`"
                     @copy="copyValue">
                     {{ contentDimensions }}
                  </DesignCopyValue>
               </div>
            </figure>
         </section>
         <section v-if="text" class="space-y-2 border-b border-white/10 px-3.5 py-3.5">
            <div class="flex items-center justify-between gap-2">
               <h3 class="text-xs font-semibold">文本</h3>
               <DesignCopyValue
                  label="文本"
                  :value="text"
                  button-class="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-accent-200"
                  @copy="copyValue">
                  <Copy :size="12" aria-hidden="true" />
                  复制文本
               </DesignCopyValue>
            </div>
            <pre class="overflow-x-auto rounded bg-white/5 p-2.5 text-sm/6 whitespace-pre select-text text-accent-200" :class="isNumericValue(text) ? numberClass : 'font-family-fira-code'"><code class="[font-family:inherit]">{{ text }}</code></pre>
         </section>
      </div>
   </aside>
</template>
