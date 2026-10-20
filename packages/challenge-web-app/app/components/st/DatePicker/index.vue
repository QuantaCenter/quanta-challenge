<script setup lang="ts">
import { Calendar, Left, Right } from '@icon-park/vue-next';
import type { FormItemStatus } from '../Form/type';
import { usePopper } from '~/composables/use-popper';
import { Teleport } from 'vue';

const props = defineProps<{
   outerClass?: string;
   status?: FormItemStatus;
   placeholder?: string;
   /** 开启日期范围选择模式 */
   range?: boolean;
}>();

const value = defineModel<string>('value', { default: '' });
// 范围模式下的起止日期（YYYY-MM-DD）
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
   const today = new Date().toISOString().split('T')[0]!;
   if (props.range) {
      startValue.value = today;
      endValue.value = today;
   } else {
      value.value = today;
   }
   opened.value = false;
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
   try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
      });
   } catch {
      return dateStr;
   }
};

const displayValue = computed(() => {
   if (props.range) {
      if (!startValue.value && !endValue.value) return '';
      return `${formatDate(startValue.value)} 至 ${formatDate(endValue.value)}`;
   }
   return formatDate(value.value);
});

// 使用 Popper 定位
const {
   containerKey,
   container,
   popperKey,
   popper,
   onPopperUpdate,
   onFirstUpdate,
} = usePopper();

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
const currentDate = new Date();
const viewYear = ref(currentDate.getFullYear());
const viewMonth = ref(currentDate.getMonth());

// 如果已有值，显示该月份
watch(
   () => (props.range ? startValue.value || endValue.value : value.value),
   (newValue) => {
      if (newValue) {
         const date = new Date(newValue);
         viewYear.value = date.getFullYear();
         viewMonth.value = date.getMonth();
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
   const year = viewYear.value;
   const month = viewMonth.value;
   const firstDay = new Date(year, month, 1);
   const lastDay = new Date(year, month + 1, 0);
   const daysInMonth = lastDay.getDate();
   const startWeekDay = firstDay.getDay();

   const days: Array<{
      date: number;
      isCurrentMonth: boolean;
      fullDate: string;
   }> = [];

   // 上个月的日期
   const prevMonthLastDay = new Date(year, month, 0).getDate();
   for (let i = startWeekDay - 1; i >= 0; i--) {
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      days.push({
         date: prevMonthLastDay - i,
         isCurrentMonth: false,
         fullDate: `${prevYear}-${String(prevMonth + 1).padStart(
            2,
            '0'
         )}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
      });
   }

   // 当前月的日期
   for (let i = 1; i <= daysInMonth; i++) {
      days.push({
         date: i,
         isCurrentMonth: true,
         fullDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(
            i
         ).padStart(2, '0')}`,
      });
   }

   // 下个月的日期
   const remainingDays = 42 - days.length; // 6 rows * 7 days
   for (let i = 1; i <= remainingDays; i++) {
      const nextYear = month === 11 ? year + 1 : year;
      const nextMonth = month === 11 ? 0 : month + 1;
      days.push({
         date: i,
         isCurrentMonth: false,
         fullDate: `${nextYear}-${String(nextMonth + 1).padStart(
            2,
            '0'
         )}-${String(i).padStart(2, '0')}`,
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
   return v ? new Date(v) : null;
});

const isSelectedYear = (year: number) =>
   selectedDate.value?.getFullYear() === year;

const isSelectedMonth = (month: number) =>
   selectedDate.value?.getFullYear() === viewYear.value &&
   selectedDate.value?.getMonth() === month;

const isCurrentYear = (year: number) =>
   year === currentDate.getFullYear();

const isCurrentMonth = (month: number) =>
   viewYear.value === currentDate.getFullYear() &&
   month === currentDate.getMonth();

/** 范围选择中的悬停日期，用于起点已选、终点未选时的区间预览 */
const hoverDate = ref('');

const selectDate = (dateStr: string) => {
   if (props.range) {
      // 首次点击选起点；起点已选且终点未选时选终点；已有完整范围则重新开始
      if (!startValue.value || (startValue.value && endValue.value)) {
         startValue.value = dateStr;
         endValue.value = '';
      } else if (dateStr < startValue.value) {
         endValue.value = startValue.value;
         startValue.value = dateStr;
         opened.value = false;
      } else {
         endValue.value = dateStr;
         opened.value = false;
      }
      return;
   }
   value.value = dateStr;
   opened.value = false;
};

const isToday = (dateStr: string) => {
   const today = new Date();
   return (
      dateStr ===
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
         2,
         '0'
      )}-${String(today.getDate()).padStart(2, '0')}`
   );
};

const isSelected = (dateStr: string) => {
   if (props.range) {
      return (
         (!!startValue.value && dateStr === startValue.value) ||
         (!!endValue.value && dateStr === endValue.value)
      );
   }
   return value.value === dateStr;
};

const isInRange = (dateStr: string) => {
   if (!props.range || !startValue.value) return false;
   // 终点未选时用悬停日期做区间预览
   let start = startValue.value;
   let end = endValue.value || hoverDate.value;
   if (!end) return false;
   if (start > end) [start, end] = [end, start];
   return dateStr > start && dateStr < end;
};

/** 选中格圆角：起始格圆左角、结束格圆右角，起止同格四角全圆；其余格子无圆角 */
const selectedRoundClass = (dateStr: string) => {
   if (props.range) {
      let start = startValue.value;
      let end = endValue.value || hoverDate.value;
      if (!start) return '';
      // 尚未形成区间（只有起点或起止同格）：整格圆角
      if (!end || start === end) return dateStr === start ? 'rounded-md' : '';
      if (start > end) [start, end] = [end, start];
      if (dateStr === start) return 'rounded-l-md';
      if (dateStr === end) return 'rounded-r-md';
      return '';
   }
   return value.value === dateStr ? 'rounded-md' : '';
};
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
               'absolute p-4 rounded-lg bg-background border border-accent-300 hover:cursor-auto z-[10001] min-w-[24rem]',
               { 'opacity-0 pointer-events-none': !opened },
               !opened && {
                  '!-mb-4': upside,
                  '!-mt-4': !upside,
               },
            ]">
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
                        'text-white hover:bg-accent-600':
                           !isSelectedYear(year),
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
                  @click.stop="selectDate(day.fullDate)"
                  @mouseenter="hoverDate = day.fullDate"
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
                        'hover:bg-accent-600':
                           day.isCurrentMonth &&
                           !isSelected(day.fullDate) &&
                           !isInRange(day.fullDate),
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
