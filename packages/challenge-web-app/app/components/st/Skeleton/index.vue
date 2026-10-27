<script setup lang="ts">
defineProps<{
   loading?: boolean;
}>();

defineOptions({ inheritAttrs: false });
</script>

<template>
   <div
      v-if="typeof loading === 'undefined' || loading"
      v-bind="$attrs"
      class="w-full">
      <slot name="loading"></slot>
   </div>
   <slot v-else></slot>
</template>
