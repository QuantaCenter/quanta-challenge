<script setup lang="ts">
import { Left, Right } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { IDateIndicatorProps } from './type';

type DayItem = IDateIndicatorProps & { date: string };

const props = defineProps<{
   /** 当前选中的日期，格式 YYYY-MM-DD */
   modelValue?: string;
}>();

const emit = defineEmits<{
   'update:modelValue': [value: string];
}>();

const offset = ref(0);

const goPreviousDay = () => {
   offset.value -= 1;
};

const goNextDay = () => {
   offset.value += 1;
};

const selectedDate = computed(
   () => props.modelValue ?? dayjs().format('YYYY-MM-DD')
);

const selectDay = (day: DayItem) => {
   if (day.future) return;
   emit('update:modelValue', day.date);
};

const dayClass = (day: DayItem) => {
   if (day.future) return 'cursor-default';
   if (day.triggered) return '';
   return 'cursor-pointer hover:bg-accent-500/60';
};

const recent7days = computed(() => {
   const today = dayjs().startOf('day');
   const days = new Array<DayItem>();
   for (let i = -3; i <= 3; i++) {
      const date = today.add(i + offset.value, 'day');
      const dateString = date.format('YYYY-MM-DD');
      days.push({
         date: dateString,
         dateText: date
            .toDate()
            .toLocaleDateString('en-US', { weekday: 'short' })
            .toUpperCase(),
         dateNumber: date.date(),
         triggered: dateString === selectedDate.value,
         checked: date.isSame(today.subtract(1, 'day'), 'day'),
         future: date.isAfter(today, 'day'),
      });
   }
   return days;
});
</script>

<template>
   <div class="flex items-center">
      <Left
         class="text-accent-400 hover:cursor-pointer hover:text-accent-300 transition-colors select-none"
         @click="goPreviousDay" />
      <div class="flex flex-1 items-center justify-between">
         <StDateIndicatorItem
            v-for="day in recent7days"
            :key="day.date"
            :class="dayClass(day)"
            :date-text="day.dateText"
            :date-number="day.dateNumber"
            :triggered="day.triggered"
            :checked="day.checked"
            :future="day.future"
            @click="selectDay(day)" />
      </div>
      <Right
         class="text-accent-400 hover:cursor-pointer hover:text-accent-300 transition-colors select-none"
         @click="goNextDay" />
   </div>
</template>
