<script setup lang="tsx">
import dayjs from 'dayjs';
import { monthText, type IHeatMapProps } from './type';
import { daysInMonths, monthCells } from './month-layout';
import StPopover from '~/components/st/Popover/index.vue';
import { Calendar, UploadOne } from '@icon-park/vue-next';

const props = defineProps<IHeatMapProps>();

const rows = computed(() => props.rows ?? 9);

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

const PopperContent = defineComponent({
   props: {
      month: { type: Number, required: true },
      day: { type: Number, required: true },
      triggered: { type: Boolean, default: false },
   },
   setup(props) {
      // mounted 决定 DOM 是否存在，visible 只负责过渡动画
      const mounted = ref(props.triggered);
      const visible = ref(props.triggered);
      let hideTimer: ReturnType<typeof setTimeout> | null = null;

      watch(
         () => props.triggered,
         (triggered) => {
            if (triggered) {
               if (hideTimer) {
                  clearTimeout(hideTimer);
                  hideTimer = null;
               }
               mounted.value = true;
               // 先以隐藏态渲染一帧，再切成可见态以触发过渡
               requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                     if (props.triggered) visible.value = true;
                  })
               );
            } else {
               visible.value = false;
               hideTimer = setTimeout(() => {
                  if (!props.triggered) mounted.value = false;
               }, 250);
            }
         },
         { immediate: true }
      );

      const onTransitionEnd = (event: TransitionEvent) => {
         if (event.target !== event.currentTarget) return;
         if (!props.triggered && !visible.value) {
            if (hideTimer) {
               clearTimeout(hideTimer);
               hideTimer = null;
            }
            mounted.value = false;
         }
      };

      return () => {
         if (!mounted.value) return null;
         const count = getCountByDate(props.month, props.day);
         const date = getDateId(props.month, props.day);
         return (
            <div
               class={[
                  'bg-accent-700 p-2 text-white rounded-md transition-all',
                  visible.value
                     ? 'translate-0 scale-100 opacity-100'
                     : 'translate-y-2 scale-90 opacity-0',
               ]}
               onTransitionend={onTransitionEnd}>
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
   },
});

const ZERO_HOVER_DELAY = 450;
const zeroTipPos = ref<{ date: string; x: number; y: number } | null>(null);
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
   // 先以隐藏态渲染一帧，再切成可见态以触发过渡
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
