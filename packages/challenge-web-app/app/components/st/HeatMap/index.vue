<script setup lang="tsx">
import dayjs from 'dayjs';
import { monthText, type IHeatMapProps } from './type';
import { daysInMonths, monthCells } from './month-layout';
import StPopover from '~/components/st/Popover/index.vue';
import { Calendar, UploadOne } from '@icon-park/vue-next';

const props = defineProps<IHeatMapProps>();

const rows = computed(() => props.rows ?? 9);

/**
 * 每个块（= 一个月）里每个格子的**真实日期**。
 *
 * 全年是一条连续日期流、每月占整列、最后一块收残 —— 详见 ./month-layout.ts。
 * 关键点：
 *   · 格子日期必须由连续流游标算出（原模板每个块都从 1 重新数，导致日期错位：
 *     1/28~1/31 永远查不到、块尾还会出现 03-32 这类幽灵日期）；
 *   · 月份天数取 props.currentYear，而不是 new Date().getFullYear()，
 *     否则跨年查看时 2 月会差一天（闰年）。
 */
const cellMonths = computed(() =>
   monthCells(daysInMonths(props.currentYear), rows.value)
);

const getDateId = (month: number, day: number) => {
   const pad = (n: number) => String(n).padStart(2, '0');
   return `${props.currentYear}-${pad(month)}-${pad(day)}`;
};

const getCountByDate = (month: number, day: number) => {
   const pad = (n: number) => String(n).padStart(2, '0');
   const dateStr = `${props.currentYear}-${pad(month)}-${pad(day)}`;
   const count = props.data[dateStr] ?? 0;
   return count;
};

onMounted(() => {
   const currentId = dayjs(new Date()).format('YYYY-MM-DD');
   const el = document.getElementById(currentId);
   props.scrollIntoView &&
      el &&
      el.scrollIntoView({
         behavior: 'smooth',
         block: 'center',
         inline: 'center',
      });
});

const PopperContent = (props: {
   month: number;
   day: number;
   triggered: boolean;
}) => {
   const { month, day, triggered } = props;
   const count = getCountByDate(month, day);
   const date = getDateId(month, day);
   return (
      <div
         class={[
            'bg-accent-700 p-2 text-white rounded-md transition-all',
            triggered
               ? 'translate-0 scale-100 opacity-100'
               : 'translate-y-2 scale-90 opacity-0',
         ]}>
         <div class='st-font-body-normal mb-1 flex items-center gap-1 text-white/60'>
            <Calendar />
            {date}
         </div>
         <div class='st-font-body-small flex items-center gap-1 text-white/60'>
            <UploadOne />
            <span>
               当日
               <span class='text-primary'> {count} </span>
               次提交
            </span>
         </div>
      </div>
   );
};

/**
 * 没有提交记录的日期：悬停"够久"之后再显示一个小提示。
 *
 * ## 为什么不用 StPopover
 *
 * 1. `StPopover` 是 hover 即显示（mouseenter 里直接把 triggered 置为 true），
 *    没有延迟能力 —— 一整年每格都挂上它，鼠标划过会一路弹气泡。
 * 2. 更要紧的是性能：`usePopper` 在**每个实例 onMounted 时就 createPopper**，
 *    给全部日期都套 Popover 等于凭空造 365 个 popper 实例 + MutationObserver。
 *
 * 所以这里只在 HeatMap 上放**一个共享气泡**，悬停满 ZERO_HOVER_DELAY 毫秒才出现，
 * 鼠标移开或滚动立刻消失。**有记录的日期依旧走原来的 StPopover，行为完全不变。**
 */
const ZERO_HOVER_DELAY = 450;
/** 气泡的位置（null = 还没有悬停过无记录的日期） */
const zeroTipPos = ref<{ date: string; x: number; y: number } | null>(null);
/**
 * 气泡是否可见 —— 与位置分开存放，是为了**模仿有记录日期的动画**：
 * 元素一直留在 DOM 里，只切换 opacity / scale / translate；如果用 `v-if` 直接
 * 挂载和卸载，出现和消失都会"啪"地一下，看起来很生硬。
 */
const zeroTipVisible = ref(false);
let zeroTimer: ReturnType<typeof setTimeout> | null = null;
let zeroAnchor: HTMLElement | null = null;

const clearZeroTimer = () => {
   if (zeroTimer) {
      clearTimeout(zeroTimer);
      zeroTimer = null;
   }
};

const hideZeroTip = () => {
   clearZeroTimer();
   zeroAnchor = null;
   // 只置为不可见：位置保留，元素留在 DOM 里播放淡出过渡
   zeroTipVisible.value = false;
};

const showZeroTip = (date: string) => {
   if (!zeroAnchor) return;

   const rect = zeroAnchor.getBoundingClientRect();
   const alreadyVisible = zeroTipVisible.value;

   zeroTipPos.value = {
      date,
      x: rect.left + rect.width / 2,
      y: rect.top,
   };

   // 已经在显示时只挪位置，不重播一次动画
   if (alreadyVisible) return;

   zeroTipVisible.value = false;
   // 先让元素以"隐藏态"渲染一帧，再切成可见态，过渡才会真正播放
   requestAnimationFrame(() =>
      requestAnimationFrame(() => {
         zeroTipVisible.value = true;
      })
   );
};

const handleCellEnter = (event: MouseEvent, month: number, day: number) => {
   // 数据还没到时每个格子都是 0，不能弹"本日没有提交记录"
   if (props.loading) return;
   // 有记录的日期由 StPopover 负责，保持原来的即时显示
   if (getCountByDate(month, day) > 0) return;

   clearZeroTimer();
   zeroAnchor = event.currentTarget as HTMLElement;
   const date = getDateId(month, day);
   zeroTimer = setTimeout(() => showZeroTip(date), ZERO_HOVER_DELAY);
};

onMounted(() => {
   // 横向滚动或页面滚动后气泡的坐标就失效了，直接收起
   window.addEventListener('scroll', hideZeroTip, true);
});

onUnmounted(() => {
   clearZeroTimer();
   window.removeEventListener('scroll', hideZeroTip, true);
});
</script>

<template>
   <table class="w-full">
      <thead>
         <tr class="font-light text-[0.875rem] text-white">
            <td v-for="(month, idx) in monthText" :key="idx">
               <div class="mb-2">{{ month }}</div>
            </td>
         </tr>
      </thead>
      <tbody>
         <tr>
            <td v-for="(cells, month) in cellMonths" :key="month">
               <div
                  :class="{
                     'mr-[0.375rem]': month !== cellMonths.length - 1,
                  }"
                  class="w-fit grid gap-[0.375rem] grid-flow-col"
                  :style="{ gridTemplateRows: `repeat(${rows}, 1fr)` }">
                  <!--
                     注意格子上的日期取自 cell（连续流里的真实日期），
                     不能再用 `month + 1` / `day` —— 一个块里会包含上个月残留与下个月补位。
                  -->
                  <Component
                     v-for="cell in cells"
                     :key="`${cell.month}-${cell.day}`"
                     :is="
                        getCountByDate(cell.month, cell.day) ? StPopover : 'div'
                     "
                     placement="top"
                     @mouseenter="handleCellEnter($event, cell.month, cell.day)"
                     @mouseleave="hideZeroTip">
                     <template #popper="{ triggered }">
                        <PopperContent
                           :month="cell.month"
                           :day="cell.day"
                           :triggered="triggered" />
                     </template>
                     <StHeatMapItem
                        :id="getDateId(cell.month, cell.day)"
                        :count="getCountByDate(cell.month, cell.day)"
                        :loading="loading" />
                  </Component>
               </div>
            </td>
         </tr>
      </tbody>
   </table>

   <!--
      没有提交记录的日期：共享的延迟气泡。
      只放这一个元素，而不是给每个格子套 St-Popover —— 后者会为 365 个日期各创建
      一个 popper.js 实例。有记录的日期仍然由 StPopover 即时显示，不受影响。

      动画刻意与有记录日期的 PopperContent 对齐：
      外层 transition-opacity，内层 transition-all + translate/scale/opacity。
   -->
   <Teleport to="body">
      <div
         v-if="zeroTipPos"
         class="pointer-events-none fixed z-[9998] -translate-x-1/2 -translate-y-full pb-2 transition-opacity"
         :class="zeroTipVisible ? 'opacity-100' : 'opacity-0'"
         :style="{ left: `${zeroTipPos.x}px`, top: `${zeroTipPos.y}px` }">
         <div
            class="bg-accent-700 p-2 text-white rounded-md transition-all"
            :class="
               zeroTipVisible
                  ? 'translate-0 scale-100 opacity-100'
                  : 'translate-y-2 scale-90 opacity-0'
            ">
            <div
               class="st-font-body-normal mb-1 flex items-center gap-1 text-white/60">
               <Calendar />
               {{ zeroTipPos.date }}
            </div>
            <div
               class="st-font-body-small flex items-center gap-1 text-white/60">
               <UploadOne />
               本日没有提交记录
            </div>
         </div>
      </div>
   </Teleport>
</template>
