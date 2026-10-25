<script setup lang="ts">
import {
   Box,
   Code,
   GoldMedalTwo,
   Help,
   History,
   Peoples,
   TableReport,
   Tag,
   Timer,
} from '@icon-park/vue-next';
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
      icon: TableReport,
      iconColor: '#C1EF3F',
   },
   {
      title: '成就管理',
      description: '查看平台上的成就，了解成就的分数与创建时间',
      url: '/app/manage/achievement',
      icon: GoldMedalTwo,
      iconColor: '#F59E0B',
   },
   {
      title: '标签管理',
      description: '查看并管理已有的题目标签',
      url: '/app/manage/tag',
      icon: Tag,
      iconColor: '#FE4E4E',
   },
   {
      title: '成员管理',
      description: '查看成员的角色、活跃时间与最近提交情况',
      url: '/app/manage/member',
      icon: Peoples,
      iconColor: '#38BDF8',
   },
   {
      title: '云函数管理',
      description: '管理云函数的启停、版本与调用凭证（API Key）',
      url: '/app/manage/cloud-function',
      icon: Code,
      iconColor: '#C267FF',
   },
   {
      title: '快照镜像管理',
      description: '查看做题环境快照镜像的构建文件、使用情况，编辑重新发布或删除',
      url: '/app/manage/image',
      icon: Box,
      iconColor: '#4CA7FF',
   },
   {
      title: '提交记录',
      description: '查看所有用户最近的提交记录与判题详情',
      url: '/app/manage/submission',
      icon: History,
      iconColor: '#F97316',
   },
   {
      title: '全部申诉',
      description: '查看用户针对严重警告提交的申诉内容',
      url: '/app/manage/appeal',
      icon: Help,
      iconColor: '#EF4444',
   },
   {
      title: '定时任务管理',
      description: '查看定时任务的执行状态，取消待执行或重试失败的任务',
      url: '/app/manage/scheduled-task',
      icon: Timer,
      iconColor: '#F97316',
   },
];
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[44rem] pb-[10rem] my-6 max-md:my-4 max-md:px-4 max-md:gap-4!">
         <h1
            class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
            管理流程
         </h1>

         <StSpace direction="vertical" gap="1.5rem" fill-x class="max-md:gap-4!">
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
                  class="p-6 max-md:p-5 border border-accent-300 rounded-xl group overflow-hidden relative hover:border-secondary/70 transition-colors cursor-pointer">
                  <StSpace direction="vertical" gap="0.5rem">
                     <h2
                        class="st-font-capture text-[1.25rem] max-md:text-[1.125rem] text-white">
                        {{ option.title }}
                     </h2>
                     <p
                        class="st-font-body-normal max-md:text-sm text-accent-300">
                        {{ option.description }}
                     </p>
                  </StSpace>
                  <Component
                     :is="option.icon"
                     :fill="option.iconColor"
                     :strokeWidth="3"
                     size="7rem"
                     class="max-md:w-[4.5rem]! max-md:h-[4.5rem]! absolute -right-5 -bottom-6 max-md:-right-1 max-md:-bottom-2 rotate-12 opacity-50 group-hover:opacity-90 group-hover:scale-125 transition-all duration-300" />
               </StSpace>
            </NuxtLink>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
