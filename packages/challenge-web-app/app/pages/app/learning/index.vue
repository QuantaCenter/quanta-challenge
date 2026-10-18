<script setup lang="ts">
import { BookOne } from '@icon-park/vue-next';

useSeoMeta({ title: '学习 - Quanta Challenge' });
</script>

<template>
   <div class="w-full min-h-[60vh] flex items-center justify-center px-4">
      <StSpace
         direction="vertical"
         gap="0.75rem"
         align="center"
         justify="center"
         class="text-accent-400 py-24">
         <BookOne size="3.625rem" :strokeWidth="2" />
         <div class="st-font-body-normal text-accent-300">学习功能即将上线</div>
         <div class="st-font-caption">课程内容正在建设中，敬请期待</div>
      </StSpace>
   </div>
</template>
