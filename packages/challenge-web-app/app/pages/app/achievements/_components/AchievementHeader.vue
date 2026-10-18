<script setup lang="ts">
import dayjs from 'dayjs';

defineProps<{
   title: string;
   achivedAt: string | null;
   score: number;
}>();
</script>

<template>
   <StSpace fill justify="between" class="min-w-0">
      <StSpace align="center" gap="0.5rem" class="min-w-0 flex-1">
         <div class="st-font-body-bold truncate min-w-0">{{ title }}</div>
         <div
            :class="[
               'st-font-tooltip py-0 px-2 rounded-md font-family-manrope select-none shrink-0 whitespace-nowrap',
               achivedAt
                  ? 'border border-secondary text-secondary'
                  : 'border border-accent-200 text-accent-200',
            ]">
            {{ score }} <span class="italic">pts</span>
         </div>
      </StSpace>
      <div
         v-if="achivedAt"
         class="st-font-caption shrink-0 whitespace-nowrap">
         <span class="md:hidden">{{
            dayjs(achivedAt).format('YYYY.MM.DD')
         }}</span>
         <span class="hidden md:inline"
            >于 {{ dayjs(achivedAt).format('YYYY.MM.DD') }} 获得</span
         >
      </div>
   </StSpace>
</template>
