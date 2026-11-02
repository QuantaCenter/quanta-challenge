<script setup lang="ts">
import {
   type FeedbackStatusFilter,
   feedbackStatusFilters,
} from './feedback-options';

const value = defineModel<FeedbackStatusFilter>({ required: true });
</script>

<template>
   <fieldset class="flex gap-1 overflow-x-auto" aria-label="处理状态">
      <button
         v-for="option in feedbackStatusFilters"
         :key="option.value"
         type="button"
         :aria-pressed="value === option.value"
         class="shrink-0 cursor-pointer rounded-lg px-3.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary max-sm:px-3"
         :class="value === option.value
            ? 'bg-accent-600 text-white'
            : 'text-accent-300 hover:bg-accent-600/50 hover:text-white'"
         @click="value = option.value"
      >
         {{ option.label }}
      </button>
   </fieldset>
</template>
