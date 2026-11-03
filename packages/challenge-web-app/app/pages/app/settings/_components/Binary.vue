<script setup lang="ts">
const modelValue = defineModel<boolean>({ default: false });
</script>

<template>
   <StSpace fill-x align="center" justify="between" class="flex">
      <span class="text-base text-accent-100">
         <slot />
      </span>
      <StSwitch v-model="modelValue" />
   </StSpace>
</template>
