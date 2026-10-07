<script setup lang="ts">
import { ListTwo, Tag } from '@icon-park/vue-next';
import type { Component } from 'vue';

useSeoMeta({ title: '管理流程 - Quanta Challenge' });

type ProcessOption = {
   title: string;
   description: string;
   url: string;
   icon: Component;
   iconColor: string;
};

const options: ProcessOption[] = [
   {
      title: '题目管理',
      description: '管理已发布的题目，查看与编辑题目信息',
      url: '/app/publish/problem/mine',
      icon: ListTwo,
      iconColor: '#38BDF8',
   },
   {
      title: '标签管理',
      description: '查看并管理已有的题目标签',
      url: '/app/manage/tag',
      icon: Tag,
      iconColor: '#FE4E4E',
   },
];
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">管理流程</h1>

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
