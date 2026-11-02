<script setup lang="ts">
import { type FeedbackStatus, feedbackStatuses } from './feedback-options';

defineProps<{ status: FeedbackStatus }>();
</script>

<template>
   <span
      class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium"
      :class="feedbackStatuses[status].color"
   >
      <span
         class="size-1.5 rounded-full"
         :class="feedbackStatuses[status].dot"
      />
      {{ feedbackStatuses[status].label }}
   </span>
</template>
