<script setup lang="ts">
import { CheckOne, ReduceOne, TableReport } from '@icon-park/vue-next';

withDefaults(
   defineProps<{
      title: string;
      completed?: boolean;
      attempted?: boolean;
   }>(),
   { completed: false, attempted: false },
);
</script>

<template>
   <StSpace fill-x gap="0.5rem" align="center">
      <CheckOne v-if="completed" size="1.25rem" class="text-success" />
      <ReduceOne v-else-if="attempted" size="1.25rem" class="text-warning" />
      <TableReport v-else size="1.25rem" />
      <div class="line-clamp-1 font-bold w-full">{{ title }}</div>
   </StSpace>
</template>
