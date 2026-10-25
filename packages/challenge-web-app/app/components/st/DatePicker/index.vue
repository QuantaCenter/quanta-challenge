<script setup lang="ts">
import { Calendar, Left, Right } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { FormItemStatus } from '../Form/type';
import { usePopper } from '~/composables/use-popper';
import { Teleport } from 'vue';

const props = defineProps<{
   outerClass?: string;
   status?: FormItemStatus;
   placeholder?: string;
   /** 开启日期范围选择模式 */
   range?: boolean;
   /** 开启具体时间选择（时 / 分） */
   showTime?: boolean;
   /** 禁用日期判断：入参为 YYYY-MM-DD，返回 true 表示该日期不可选 */
   disabledDate?: (dateStr: string) => boolean;
   /** 可选时间下限（YYYY-MM-DD 或 YYYY-MM-DD HH:mm）：更早的日期不可选，下限当天的更早时分也不可选 */
   minDateTime?: string;
}>();

const value = defineModel<string>('value', { default: '' });
// 范围模式下的起止日期（YYYY-MM-DD，开启 showTime 后为 YYYY-MM-DD HH:mm）
const startValue = defineModel<string>('startValue', { default: '' });
const endValue = defineModel<string>('endValue', { default: '' });

const borderClass = computed(() => {
   return props.status === 'error'
      ? '!border !border-error'
      : props.status === 'success'
      ? '!border !border-success'
      : '';
});

const opened = ref(false);

const togglePicker = () => {
   opened.value = !opened.value;
   // 重新打开时回到日期视图
   if (opened.value) {
      viewMode.value = 'date';
      hoverDate.value = '';
   }
};

const selectToday = () => {
   const today = dayjs().format('YYYY-MM-DD');
   if (isDisabled(today)) return;
   if (props.range) {
      startValue.value = withTime(today, '00:00');
      endValue.value = withTime(today, '23:59');
   } else {
      value.value = withTime(today, defaultTimeFor(today));
   }
   if (!props.showTime) opened.value = false;
};

const clearValue = () => {
   if (props.range) {
      startValue.value = '';
      endValue.value = '';
   } else {
      value.value = '';
   }
   opened.value = false;
};

const formatDate = (dateStr: string) => {
   if (!dateStr) return '';
   const date = dayjs(dateStr);
   return date.isValid() ? date.format('YYYY/MM/DD') : dateStr;
};

/** 取日期部分（YYYY-MM-DD），兼容带时间的值 */
const datePart = (dateStr: string) => dateStr.split(' ')[0] ?? '';
/** 取时间部分（HH:mm），无时间时默认 00:00 */
const timePart = (dateStr: string) => dateStr.split(' ')[1] ?? '00:00';

const pad = (num: number) => String(num).padStart(2, '0');

/** 拼接日期与时间：未开启 showTime 时仅返回日期 */
const withTime = (dateStr: string, time: string) =>
   props.showTime ? `${dateStr} ${time}` : dateStr;

const formatDateTime = (dateStr: string) => {
   if (!dateStr) return '';
   if (!props.showTime) return formatDate(dateStr);
   return `${formatDate(datePart(dateStr))} ${timePart(dateStr)}`;
};

const displayValue = computed(() => {
   if (props.range) {
      if (!startValue.value && !endValue.value) return '';
      return `${formatDateTime(startValue.value)} 至 ${formatDateTime(
         endValue.value
      )}`;
   }
   return formatDateTime(value.value);
});

// 使用 Popper 定位（不随输入框宽度拉伸）
const {
   containerKey,
   container,
   popperKey,
   popper,
   onPopperUpdate,
   onFirstUpdate,
} = usePopper({ fillWidth: false });

const upside = ref(false);
onPopperUpdate('write', ({ state }) => {
   upside.value = state.placement?.startsWith('top') ?? false;
});
onFirstUpdate((state) => {
   upside.value = state.placement?.startsWith('top') ?? false;
});

// 点击外部关闭
onMounted(() => {
   const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popper.value?.contains(target) || container.value?.contains(target))
         return;
      opened.value = false;
   };
   document.addEventListener('click', close);
   onUnmounted(() => {
      document.removeEventListener('click', close);
   });
});

// 日历逻辑
const now = dayjs();
const viewYear = ref(now.year());
const viewMonth = ref(now.month());

// 如果已有值，显示该月份
watch(
   () => (props.range ? startValue.value || endValue.value : value.value),
   (newValue) => {
      if (newValue) {
         const date = dayjs(newValue);
         if (date.isValid()) {
            viewYear.value = date.year();
            viewMonth.value = date.month();
         }
      }
   },
   { immediate: true }
);

const monthNames = [
   '一月',
   '二月',
   '三月',
   '四月',
   '五月',
   '六月',
   '七月',
   '八月',
   '九月',
   '十月',
   '十一月',
   '十二月',
];
const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

const calendarDays = computed(() => {
   const monthStart = dayjs()
      .year(viewYear.value)
      .month(viewMonth.value)
      .startOf('month');
   const daysInMonth = monthStart.daysInMonth();
   const startWeekDay = monthStart.day();

   const days: Array<{
      date: number;
      isCurrentMonth: boolean;
      fullDate: string;
   }> = [];

   // 上个月的日期
   for (let i = startWeekDay - 1; i >= 0; i--) {
      const day = monthStart.subtract(i + 1, 'day');
      days.push({
         date: day.date(),
         isCurrentMonth: false,
         fullDate: day.format('YYYY-MM-DD'),
      });
   }

   // 当前月的日期
   for (let i = 1; i <= daysInMonth; i++) {
      days.push({
         date: i,
         isCurrentMonth: true,
         fullDate: monthStart.date(i).format('YYYY-MM-DD'),
      });
   }

   // 下个月的日期
   const remainingDays = 42 - days.length; // 6 rows * 7 days
   for (let i = 1; i <= remainingDays; i++) {
      const day = monthStart.add(1, 'month').date(i);
      days.push({
         date: i,
         isCurrentMonth: false,
         fullDate: day.format('YYYY-MM-DD'),
      });
   }

   return days;
});

const prevMonth = () => {
   if (viewMonth.value === 0) {
      viewMonth.value = 11;
      viewYear.value--;
   } else {
      viewMonth.value--;
   }
};

const nextMonth = () => {
   if (viewMonth.value === 11) {
      viewMonth.value = 0;
      viewYear.value++;
   } else {
      viewMonth.value++;
   }
};

// 年 / 月快速选择：date(日) -> month(月面板) -> year(年面板)
const viewMode = ref<'date' | 'month' | 'year'>('date');

/** 年视图 12 年一屏（如 2020 - 2031） */
const decadeStart = computed(() => Math.floor(viewYear.value / 12) * 12);
const yearGrid = computed(() =>
   Array.from({ length: 12 }, (_, i) => decadeStart.value + i)
);

const prevYear = () => {
   viewYear.value--;
};

const nextYear = () => {
   viewYear.value++;
};

const prevDecade = () => {
   viewYear.value -= 12;
};

const nextDecade = () => {
   viewYear.value += 12;
};

const selectYear = (year: number) => {
   viewYear.value = year;
   viewMode.value = 'month';
};

const selectMonth = (month: number) => {
   viewMonth.value = month;
   viewMode.value = 'date';
};

const selectedDate = computed(() => {
   const v = props.range
      ? startValue.value || endValue.value
      : value.value;
   return v && dayjs(v).isValid() ? dayjs(v) : null;
});

const isSelectedYear = (year: number) => selectedDate.value?.year() === year;

const isSelectedMonth = (month: number) =>
   selectedDate.value?.year() === viewYear.value &&
   selectedDate.value?.month() === month;

const isCurrentYear = (year: number) => year === now.year();

const isCurrentMonth = (month: number) =>
   viewYear.value === now.year() && month === now.month();

/** 范围选择中的悬停日期，用于起点已选、终点未选时的区间预览 */
const hoverDate = ref('');

// 可选时间下限（minDateTime）的日期与时分部分
const minDatePart = computed(() => props.minDateTime?.split(' ')[0] ?? '');
const minTimePart = computed(() => props.minDateTime?.split(' ')[1] ?? '');

/** 该日期是否被 disabledDate 或 minDateTime 禁选 */
const isDisabled = (dateStr: string) => {
   if (props.disabledDate?.(dateStr)) return true;
   if (minDatePart.value && dateStr < minDatePart.value) return true;
   return false;
};

/** 选中某日期时写入的默认时间：下限当天从下限时分起，其余从 00:00 起 */
const defaultTimeFor = (dateStr: string) => {
   if (
      minDatePart.value &&
      minTimePart.value &&
      dateStr === minDatePart.value
   ) {
      return minTimePart.value;
   }
   return '00:00';
};

const selectDate = (dateStr: string) => {
   if (isDisabled(dateStr)) return;
   if (props.range) {
      // 首次点击选起点；起点已选且终点未选时选终点；已有完整范围则重新开始
      if (!startValue.value || (startValue.value && endValue.value)) {
         startValue.value = withTime(dateStr, '00:00');
         endValue.value = '';
      } else if (dateStr < datePart(startValue.value)) {
         const prevStart = startValue.value;
         startValue.value = withTime(dateStr, timePart(prevStart));
         endValue.value = withTime(datePart(prevStart), '23:59');
      } else {
         endValue.value = withTime(dateStr, '23:59');
      }
      // 开启时间选择时保持弹层打开，便于继续选择具体时间
      if (!props.showTime) opened.value = false;
      return;
   }
   value.value = withTime(dateStr, defaultTimeFor(dateStr));
   if (!props.showTime) opened.value = false;
};

const isToday = (dateStr: string) => dateStr === now.format('YYYY-MM-DD');

const isSelected = (dateStr: string) => {
   if (props.range) {
      return (
         (!!startValue.value && datePart(startValue.value) === dateStr) ||
         (!!endValue.value && datePart(endValue.value) === dateStr)
      );
   }
   return datePart(value.value) === dateStr;
};

const isInRange = (dateStr: string) => {
   if (!props.range || !startValue.value) return false;
   // 终点未选时用悬停日期做区间预览
   let start = datePart(startValue.value);
   let end = datePart(endValue.value) || hoverDate.value;
   if (!end) return false;
   if (start > end) [start, end] = [end, start];
   return dateStr > start && dateStr < end;
};

/** 选中格圆角：起始格圆左角、结束格圆右角，起止同格四角全圆；其余格子无圆角 */
const selectedRoundClass = (dateStr: string) => {
   if (props.range) {
      let start = datePart(startValue.value);
      let end = datePart(endValue.value) || hoverDate.value;
      if (!start) return '';
      // 尚未形成区间（只有起点或起止同格）：整格圆角
      if (!end || start === end) return dateStr === start ? 'rounded-md' : '';
      if (start > end) [start, end] = [end, start];
      if (dateStr === start) return 'rounded-l-md';
      if (dateStr === end) return 'rounded-r-md';
      return '';
   }
   return datePart(value.value) === dateStr ? 'rounded-md' : '';
};

// 具体时间选择（showTime）
const hourOptions = Array.from({ length: 24 }, (_, i) => i);
const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

const startTime = computed(() => timePart(startValue.value));
const endTime = computed(() => timePart(endValue.value));
const singleTime = computed(() => timePart(value.value));

const isHourSelected = (time: string, hour: number) =>
   Number(time.split(':')[0]) === hour;
const isMinuteSelected = (time: string, minute: number) =>
   Number(time.split(':')[1]) === minute;

const setSingleTime = (hour?: number, minute?: number) => {
   const [curHour = 0, curMinute = 0] = singleTime.value
      .split(':')
      .map(Number);
   value.value = `${datePart(value.value)} ${pad(hour ?? curHour)}:${pad(
      minute ?? curMinute
   )}`;
};

const setStartTime = (hour?: number, minute?: number) => {
   const [curHour = 0, curMinute = 0] = startTime.value
      .split(':')
      .map(Number);
   startValue.value = `${datePart(startValue.value)} ${pad(
      hour ?? curHour
   )}:${pad(minute ?? curMinute)}`;
};

const setEndTime = (hour?: number, minute?: number) => {
   const [curHour = 0, curMinute = 0] = endTime.value.split(':').map(Number);
   endValue.value = `${datePart(endValue.value)} ${pad(
      hour ?? curHour
   )}:${pad(minute ?? curMinute)}`;
};

/** 起止同一天时，结束时间不能早于开始时间 */
const isSameDay = computed(
   () =>
      props.range &&
      !!startValue.value &&
      !!endValue.value &&
      datePart(startValue.value) === datePart(endValue.value)
);

const isEndHourDisabled = (hour: number) =>
   isSameDay.value && hour < Number(startTime.value.split(':')[0]);

const isEndMinuteDisabled = (minute: number) =>
   isSameDay.value &&
   Number(endTime.value.split(':')[0]) ===
      Number(startTime.value.split(':')[0]) &&
   minute < Number(startTime.value.split(':')[1]);

/** 单选模式受 minDateTime 约束：选中日期为下限当天时，早于下限的时不可选 */
const isSingleHourDisabled = (hour: number) => {
   if (!minTimePart.value || !value.value) return false;
   if (datePart(value.value) !== minDatePart.value) return false;
   return hour < Number(minTimePart.value.split(':')[0]);
};

/** 单选模式受 minDateTime 约束：下限当天且小时等于下限小时时，早于下限的分不可选 */
const isSingleMinuteDisabled = (minute: number) => {
   if (!minTimePart.value || !value.value) return false;
   if (datePart(value.value) !== minDatePart.value) return false;
   const [minHour = 0, minMinute = 0] = minTimePart.value
      .split(':')
      .map(Number);
   if (Number(singleTime.value.split(':')[0]) !== minHour) return false;
   return minute < minMinute;
};

// 开始时间被调晚后，自动收拢结束时间
watch(
   [startTime, endTime, isSameDay],
   ([start, end, sameDay]) => {
      if (sameDay && end < start) {
         endValue.value = `${datePart(endValue.value)} ${start}`;
      }
   }
);

// 时间列滚动定位到当前选中值
const startHourCol = ref<HTMLElement | null>(null);
const startMinuteCol = ref<HTMLElement | null>(null);
const endHourCol = ref<HTMLElement | null>(null);
const endMinuteCol = ref<HTMLElement | null>(null);
const singleHourCol = ref<HTMLElement | null>(null);
const singleMinuteCol = ref<HTMLElement | null>(null);

watch(
   [startValue, endValue, value],
   async () => {
      if (!props.showTime) return;
      await nextTick();
      const scrollTo = (col: HTMLElement | null, index: number) => {
         if (!col) return;
         col.scrollTo({
            top: Math.max(0, index * 28 - col.clientHeight / 2 + 14),
            behavior: 'smooth',
         });
      };
      scrollTo(startHourCol.value, Number(startTime.value.split(':')[0]));
      scrollTo(startMinuteCol.value, Number(startTime.value.split(':')[1]));
      scrollTo(endHourCol.value, Number(endTime.value.split(':')[0]));
      scrollTo(endMinuteCol.value, Number(endTime.value.split(':')[1]));
      scrollTo(singleHourCol.value, Number(singleTime.value.split(':')[0]));
      scrollTo(singleMinuteCol.value, Number(singleTime.value.split(':')[1]));
   },
   { flush: 'post' }
);
</script>

<template>
   <div
      :ref="containerKey"
      @click="togglePicker"
      :class="[
         outerClass,
         borderClass,
         'border-accent-300 text-white flex items-center hover:cursor-pointer relative',
      ]">
      <input
         type="text"
         readonly
         :value="displayValue"
         :placeholder="placeholder || (range ? '请选择日期范围' : '请选择日期')"
         class="w-full outline-none border-none bg-transparent pointer-events-none text-white placeholder:text-accent-300" />
      <div
         class="text-accent-200 hover:text-white transition-colors cursor-pointer flex-shrink-0">
         <Calendar :size="20" :strokeWidth="3" />
      </div>

      <Teleport to="body" class="absolute z-50">
         <div
            :ref="popperKey"
            :style="{
               transition: 'margin 0.1s ease-in-out, opacity 0.1s ease-in-out',
            }"
            :class="[
               'absolute p-4 rounded-lg bg-background border border-accent-300 hover:cursor-auto z-[10001] min-w-[24rem] max-sm:min-w-0 max-sm:max-w-[calc(100vw-1rem)]',
               { 'opacity-0 pointer-events-none': !opened },
               !opened && {
                  '!-mb-4': upside,
                  '!-mt-4': !upside,
               },
            ]">
            <!-- 范围模式：开始时间面板（浮于日期面板左侧，高度与日期面板一致） -->
            <div
               v-if="showTime && range && startValue"
               class="absolute right-full top-0 bottom-0 mr-3 flex flex-col w-[8.5rem] bg-background border border-accent-300 rounded-lg overflow-hidden">
               <div
                  class="px-3 py-2 text-sm text-accent-300 border-b border-accent-500">
                  开始时间
               </div>
               <div class="flex flex-1 min-h-0">
                  <div
                     ref="startHourCol"
                     class="flex-1 overflow-y-auto border-r border-accent-500 py-1">
                     <button
                        v-for="hour in hourOptions"
                        :key="hour"
                        @click.stop="setStartTime(hour)"
                        :class="[
                           'w-full h-7 text-xs transition-colors',
                           {
                              'bg-primary text-black font-bold':
                                 isHourSelected(startTime, hour),
                              'text-white hover:bg-accent-600':
                                 !isHourSelected(startTime, hour),
                           },
                        ]">
                        {{ pad(hour) }} 时
                     </button>
                  </div>
                  <div
                     ref="startMinuteCol"
                     class="flex-1 overflow-y-auto py-1">
                     <button
                        v-for="minute in minuteOptions"
                        :key="minute"
                        @click.stop="setStartTime(undefined, minute)"
                        :class="[
                           'w-full h-7 text-xs transition-colors',
                           {
                              'bg-primary text-black font-bold':
                                 isMinuteSelected(startTime, minute),
                              'text-white hover:bg-accent-600':
                                 !isMinuteSelected(startTime, minute),
                           },
                        ]">
                        {{ pad(minute) }} 分
                     </button>
                  </div>
               </div>
            </div>

            <!-- 范围模式：结束时间面板（浮于日期面板右侧，高度与日期面板一致） -->
            <div
               v-if="showTime && range && endValue"
               class="absolute left-full top-0 bottom-0 ml-3 flex flex-col w-[8.5rem] bg-background border border-accent-300 rounded-lg overflow-hidden">
               <div
                  class="px-3 py-2 text-sm text-accent-300 border-b border-accent-500">
                  结束时间
               </div>
               <div class="flex flex-1 min-h-0">
                  <div
                     ref="endHourCol"
                     class="flex-1 overflow-y-auto border-r border-accent-500 py-1">
                     <button
                        v-for="hour in hourOptions"
                        :key="hour"
                        :disabled="isEndHourDisabled(hour)"
                        @click.stop="setEndTime(hour)"
                        :class="[
                           'w-full h-7 text-xs transition-colors',
                           {
                              'bg-primary text-black font-bold':
                                 isHourSelected(endTime, hour),
                              'text-white hover:bg-accent-600':
                                 !isHourSelected(endTime, hour) &&
                                 !isEndHourDisabled(hour),
                              'text-accent-500 cursor-not-allowed':
                                 isEndHourDisabled(hour),
                           },
                        ]">
                        {{ pad(hour) }} 时
                     </button>
                  </div>
                  <div
                     ref="endMinuteCol"
                     class="flex-1 overflow-y-auto py-1">
                     <button
                        v-for="minute in minuteOptions"
                        :key="minute"
                        :disabled="isEndMinuteDisabled(minute)"
                        @click.stop="setEndTime(undefined, minute)"
                        :class="[
                           'w-full h-7 text-xs transition-colors',
                           {
                              'bg-primary text-black font-bold':
                                 isMinuteSelected(endTime, minute),
                              'text-white hover:bg-accent-600':
                                 !isMinuteSelected(endTime, minute) &&
                                 !isEndMinuteDisabled(minute),
                              'text-accent-500 cursor-not-allowed':
                                 isEndMinuteDisabled(minute),
                           },
                        ]">
                        {{ pad(minute) }} 分
                     </button>
                  </div>
               </div>
            </div>

            <!-- 单选模式：时间面板（浮于日期面板右侧，高度与日期面板一致） -->
            <div
               v-if="showTime && !range && value"
               class="absolute left-full top-0 bottom-0 ml-3 flex flex-col w-[8.5rem] bg-background border border-accent-300 rounded-lg overflow-hidden">
               <div
                  class="px-3 py-2 text-sm text-accent-300 border-b border-accent-500">
                  时间
               </div>
               <div class="flex flex-1 min-h-0">
                  <div
                     ref="singleHourCol"
                     class="flex-1 overflow-y-auto border-r border-accent-500 py-1">
                     <button
                        v-for="hour in hourOptions"
                        :key="hour"
                        :disabled="isSingleHourDisabled(hour)"
                        @click.stop="setSingleTime(hour)"
                        :class="[
                           'w-full h-7 text-xs transition-colors',
                           {
                              'bg-primary text-black font-bold':
                                 isHourSelected(singleTime, hour),
                              'text-white hover:bg-accent-600':
                                 !isHourSelected(singleTime, hour) &&
                                 !isSingleHourDisabled(hour),
                              'text-accent-500 cursor-not-allowed':
                                 isSingleHourDisabled(hour),
                           },
                        ]">
                        {{ pad(hour) }} 时
                     </button>
                  </div>
                  <div
                     ref="singleMinuteCol"
                     class="flex-1 overflow-y-auto py-1">
                     <button
                        v-for="minute in minuteOptions"
                        :key="minute"
                        :disabled="isSingleMinuteDisabled(minute)"
                        @click.stop="setSingleTime(undefined, minute)"
                        :class="[
                           'w-full h-7 text-xs transition-colors',
                           {
                              'bg-primary text-black font-bold':
                                 isMinuteSelected(singleTime, minute),
                              'text-white hover:bg-accent-600':
                                 !isMinuteSelected(singleTime, minute) &&
                                 !isSingleMinuteDisabled(minute),
                              'text-accent-500 cursor-not-allowed':
                                 isSingleMinuteDisabled(minute),
                           },
                        ]">
                        {{ pad(minute) }} 分
                     </button>
                  </div>
               </div>
            </div>

            <!-- 头部：年月选择 -->
            <div class="flex items-center justify-between mb-4 text-white">
               <button
                  @click.stop="
                     viewMode === 'date'
                        ? prevMonth()
                        : viewMode === 'month'
                        ? prevYear()
                        : prevDecade()
                  "
                  class="p-2 hover:bg-accent-600 rounded-md transition-colors">
                  <Left :size="16" />
               </button>
               <!-- 日视图：年、月分别可点，进入对应面板 -->
               <div
                  v-if="viewMode === 'date'"
                  class="st-font-body-bold flex gap-1">
                  <button
                     @click.stop="viewMode = 'year'"
                     class="hover:text-primary transition-colors">
                     {{ viewYear }} 年
                  </button>
                  <button
                     @click.stop="viewMode = 'month'"
                     class="hover:text-primary transition-colors">
                     {{ monthNames[viewMonth] }}
                  </button>
               </div>
               <!-- 月 / 年视图：点击标题返回日视图 -->
               <button
                  v-else
                  @click.stop="viewMode = 'date'"
                  class="st-font-body-bold hover:text-primary transition-colors">
                  {{
                     viewMode === 'month'
                        ? `${viewYear} 年`
                        : `${decadeStart} - ${decadeStart + 11}`
                  }}
               </button>
               <button
                  @click.stop="
                     viewMode === 'date'
                        ? nextMonth()
                        : viewMode === 'month'
                        ? nextYear()
                        : nextDecade()
                  "
                  class="p-2 hover:bg-accent-600 rounded-md transition-colors">
                  <Right :size="16" />
               </button>
            </div>

            <!-- 年视图：12 年一屏，快速跳转 -->
            <div v-if="viewMode === 'year'" class="grid grid-cols-4 gap-1">
               <button
                  v-for="year in yearGrid"
                  :key="year"
                  @click.stop="selectYear(year)"
                  :class="[
                     'h-9 flex items-center justify-center rounded-md text-sm transition-colors',
                     {
                        'bg-primary text-black font-bold': isSelectedYear(year),
                        'border border-primary':
                           isCurrentYear(year) && !isSelectedYear(year),
                        'text-white hover:bg-accent-600': !isSelectedYear(year),
                     },
                  ]">
                  {{ year }}
               </button>
            </div>

            <!-- 月视图：12 月一屏，快速跳转 -->
            <div
               v-else-if="viewMode === 'month'"
               class="grid grid-cols-3 gap-1">
               <button
                  v-for="(name, month) in monthNames"
                  :key="name"
                  @click.stop="selectMonth(month)"
                  :class="[
                     'h-9 flex items-center justify-center rounded-md text-sm transition-colors',
                     {
                        'bg-primary text-black font-bold':
                           isSelectedMonth(month),
                        'border border-primary':
                           isCurrentMonth(month) && !isSelectedMonth(month),
                        'text-white hover:bg-accent-600':
                           !isSelectedMonth(month),
                     },
                  ]">
                  {{ name }}
               </button>
            </div>

            <template v-else>

            <!-- 星期标题 -->
            <div class="grid grid-cols-7 mb-2">
               <div
                  v-for="day in weekDays"
                  :key="day"
                  class="text-center text-accent-300 text-sm py-2">
                  {{ day }}
               </div>
            </div>

            <!-- 日期网格 -->
            <div class="grid grid-cols-7">
               <button
                  v-for="(day, index) in calendarDays"
                  :key="index"
                  :disabled="isDisabled(day.fullDate)"
                  @click.stop="selectDate(day.fullDate)"
                  @mouseenter="
                     hoverDate = isDisabled(day.fullDate)
                        ? hoverDate
                        : day.fullDate
                  "
                  :class="[
                     'aspect-square flex items-center justify-center text-sm transition-colors',
                     selectedRoundClass(day.fullDate),
                     {
                        'text-accent-400': !day.isCurrentMonth,
                        'text-white': day.isCurrentMonth,
                        'bg-primary text-black font-bold': isSelected(
                           day.fullDate
                        ),
                        'bg-primary/20 text-white':
                           isInRange(day.fullDate) && !isSelected(day.fullDate),
                        'border border-primary':
                           isToday(day.fullDate) && !isSelected(day.fullDate),
                        '!text-accent-500 cursor-not-allowed':
                           isDisabled(day.fullDate),
                        'hover:bg-accent-600':
                           day.isCurrentMonth &&
                           !isSelected(day.fullDate) &&
                           !isInRange(day.fullDate) &&
                           !isDisabled(day.fullDate),
                     },
                  ]">
                  {{ day.date }}
               </button>
            </div>
            </template>

            <!-- 快捷按钮 -->
            <div class="mt-4 pt-4 border-t border-accent-500 flex gap-2">
               <button
                  @click.stop="selectToday()"
                  class="flex-1 py-2 px-3 text-sm bg-accent-600 hover:bg-accent-500 text-white rounded-md transition-colors">
                  今天
               </button>
               <button
                  @click.stop="clearValue()"
                  class="flex-1 py-2 px-3 text-sm bg-accent-600 hover:bg-accent-500 text-white rounded-md transition-colors">
                  清空
               </button>
            </div>
         </div>
      </Teleport>
   </div>
</template>
