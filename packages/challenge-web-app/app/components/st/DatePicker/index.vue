<script setup lang="ts">
import { Calendar, Left, Right } from '@icon-park/vue-next';
import type { FormItemStatus } from '../Form/type';
import { usePopper } from '~/composables/use-popper';
import { Teleport } from 'vue';

const props = defineProps<{
   outerClass?: string;
   status?: FormItemStatus;
   placeholder?: string;
}>();

const value = defineModel<string>('value', { default: '' });

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
   if (opened.value) {
      void nextTick(() => popperInstance.value?.update());
   }
};

const displayValue = computed(() => {
   if (!value.value) return '';
   try {
      const date = new Date(value.value);
      return date.toLocaleDateString('zh-CN', {
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
      });
   } catch {
      return value.value;
   }
});

// 使用 Popper 定位
const {
   containerKey,
   container,
   popperKey,
   popper,
   popperInstance,
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
   () => value.value,
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

const selectDate = (dateStr: string) => {
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
   return value.value === dateStr;
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
         :placeholder="placeholder || '请选择日期'"
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
               'absolute p-4 rounded-lg bg-background border border-accent-300 hover:cursor-auto z-[10001]',
               { 'opacity-0 pointer-events-none max-md:hidden': !opened },
               !opened && {
                  '!-mb-4': upside,
                  '!-mt-4': !upside,
               },
            ]">
            <!-- 头部：年月选择 -->
            <div class="flex items-center justify-between mb-4 text-white">
               <button
                  @click.stop="prevMonth"
                  class="p-2 hover:bg-accent-600 rounded-md transition-colors">
                  <Left :size="16" />
               </button>
               <div class="st-font-body-bold">
                  {{ viewYear }} 年 {{ monthNames[viewMonth] }}
               </div>
               <button
                  @click.stop="nextMonth"
                  class="p-2 hover:bg-accent-600 rounded-md transition-colors">
                  <Right :size="16" />
               </button>
            </div>

            <!-- 星期标题 -->
            <div class="grid grid-cols-7 gap-1 mb-2">
               <div
                  v-for="day in weekDays"
                  :key="day"
                  class="text-center text-accent-300 text-sm py-2 w-9">
                  {{ day }}
               </div>
            </div>

            <!-- 日期网格 -->
            <div class="grid grid-cols-7 gap-1">
               <button
                  v-for="(day, index) in calendarDays"
                  :key="index"
                  @click.stop="selectDate(day.fullDate)"
                  :class="[
                     'w-9 h-9 flex items-center justify-center rounded-md text-sm transition-colors',
                     {
                        'text-accent-400': !day.isCurrentMonth,
                        'text-white': day.isCurrentMonth,
                        'bg-primary text-black font-bold': isSelected(
                           day.fullDate
                        ),
                        'border border-primary':
                           isToday(day.fullDate) && !isSelected(day.fullDate),
                        'hover:bg-accent-600':
                           day.isCurrentMonth && !isSelected(day.fullDate),
                     },
                  ]">
                  {{ day.date }}
               </button>
            </div>

            <!-- 快捷按钮 -->
            <div class="mt-4 pt-4 border-t border-accent-500 flex gap-2">
               <button
                  @click.stop="
                     selectDate(new Date().toISOString().split('T')[0]!)
                  "
                  class="flex-1 py-2 px-3 text-sm bg-accent-600 hover:bg-accent-500 text-white rounded-md transition-colors">
                  今天
               </button>
               <button
                  @click.stop="
                     () => {
                        value = '';
                        opened = false;
                     }
                  "
                  class="flex-1 py-2 px-3 text-sm bg-accent-600 hover:bg-accent-500 text-white rounded-md transition-colors">
                  清空
               </button>
            </div>
         </div>
      </Teleport>
   </div>
</template>
