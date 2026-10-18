<script setup lang="ts"></script>

<template>
   <StSpace
      direction="vertical"
      fill
      gap="0.5rem"
      class="absolute left-0 top-0 max-md:!static">
      <StSkeletonItem
         v-for="i in 6"
         :key="i"
         :deep="2"
         class="w-full h-[3.4375rem] rounded-lg" />
   </StSpace>
</template>
