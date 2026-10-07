<script setup lang="ts">
import { Left, Right } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { IDateIndicatorProps } from './type';

const offset = ref(0);

const goPreviousDay = () => {
   offset.value -= 1;
};

const goNextDay = () => {
   offset.value += 1;
};

const recent7days = computed(() => {
   const today = dayjs().startOf('day');
   const days = new Array<IDateIndicatorProps>();
   for (let i = -3; i <= 3; i++) {
      const date = today.add(i + offset.value, 'day');
      days.push({
         dateText: date
            .toDate()
            .toLocaleDateString('en-US', { weekday: 'short' })
            .toUpperCase(),
         dateNumber: date.date(),
         triggered: date.isSame(today, 'day'),
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
            v-for="(day, index) in recent7days"
            :key="index"
            :date-text="day.dateText"
            :date-number="day.dateNumber"
            :triggered="day.triggered"
            :checked="day.checked"
            :future="day.future" />
      </div>
      <Right
         class="text-accent-400 hover:cursor-pointer hover:text-accent-300 transition-colors select-none"
         @click="goNextDay" />
   </div>
</template>
