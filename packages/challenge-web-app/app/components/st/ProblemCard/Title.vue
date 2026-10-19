<script setup lang="ts">
import { CheckOne, TableReport } from '@icon-park/vue-next';

withDefaults(
   defineProps<{
      title: string;
      completed?: boolean;
   }>(),
   { completed: false },
);
</script>

<template>
   <StSpace fill-x gap="0.5rem" align="center">
      <CheckOne v-if="completed" size="1.25rem" class="text-success" />
      <TableReport v-else size="1.25rem" />
      <div class="line-clamp-1 font-bold w-full">{{ title }}</div>
   </StSpace>
</template>
