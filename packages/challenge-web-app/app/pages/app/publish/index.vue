<script setup lang="ts">
import { Code, GoldMedalTwo, TableReport, Tag } from '@icon-park/vue-next';

useSeoMeta({ title: '发布流程 - Quanta Challenge' });

const options = [
   {
      title: '发布题目',
      description: '创建一个新的判题流程，并配置题目的基本信息',
      url: '/app/publish/problem',
      icon: TableReport,
      iconColor: '#C1EF3F',
   },
   {
      title: '创建成就',
      description: '创建一个新的成就，并配置成就的基本信息',
      url: '/app/publish/achievement',
      icon: GoldMedalTwo,
      iconColor: '#F59E0B',
   },
   {
      title: '创建标签',
      description: '创建新的题目标签，并为标签配置颜色与图标',
      url: '/app/publish/create-tag',
      icon: Tag,
      iconColor: '#FE4E4E',
   },
   {
      title: '发布云函数',
      description: '发布可被成员与内部服务通过 HTTP 调用的 JS/TS 云函数',
      url: '/app/publish/cloud-function',
      icon: Code,
      iconColor: '#C267FF',
   },
];
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">发布流程</h1>

         <StSpace direction="vertical" gap="1.5rem" fill-x>
            <NuxtLink
               v-for="option in options"
               :key="option.title"
               :to="option.url"
               class="w-full">
               <StSpace
                  fill-x
                  :to="option.url"
                  justify="between"
                  align="center"
                  class="p-6 border border-accent-300 rounded-xl group overflow-hidden relative hover:border-secondary/70 transition-colors cursor-pointer">
                  <StSpace direction="vertical" gap="0.5rem">
                     <h2 class="st-font-capture text-[1.25rem] text-white">
                        {{ option.title }}
                     </h2>
                     <p class="st-font-body-normal text-accent-300">
                        {{ option.description }}
                     </p>
                  </StSpace>
                  <Component
                     :is="option.icon"
                     :fill="option.iconColor"
                     :strokeWidth="3"
                     size="7rem"
                     class="absolute -right-5 -bottom-6 rotate-12 opacity-50 group-hover:opacity-90 group-hover:scale-125 transition-all duration-300" />
               </StSpace>
            </NuxtLink>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
