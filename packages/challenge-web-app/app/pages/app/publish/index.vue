<script setup lang="ts">
import {
   Box,
   Code,
   FileText,
   GoldMedalTwo,
   TableReport,
   Tag,
   Timer,
   Topic,
   VolumeNotice,
} from '@icon-park/vue-next';

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
      title: '创建学习文章',
      description: '编写 Markdown 教程，插入题目与可实时预览的 Playground',
      url: '/app/publish/article/new',
      icon: FileText,
      iconColor: '#38BDF8',
   },
   {
      title: '创建学习专题',
      description: '将学习文章与题目混排组织为专题',
      url: '/app/publish/topic/new',
      icon: Topic,
      iconColor: '#34D399',
   },
   {
      title: '构建快照镜像',
      description: '用构建脚本预装依赖，生成做题页 WebContainer 启动时挂载的快照镜像（不影响判题）',
      url: '/app/publish/image',
      icon: Box,
      iconColor: '#4CA7FF',
      // 依赖跨源隔离响应头，需整页加载
      needFullLoad: true,
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
   {
      title: '发送通知',
      description: '向全体或指定用户发送日常公告与严重警告',
      url: '/app/publish/notification',
      icon: VolumeNotice,
      iconColor: '#8B5CF6',
   },
   {
      title: '定时任务',
      description: '创建定时执行的运营任务',
      url: '/app/publish/scheduled-task',
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
            发布流程
         </h1>

         <StSpace direction="vertical" gap="1.5rem" fill-x class="max-md:gap-4!">
            <NuxtLink
               v-for="option in options"
               :key="option.title"
               :to="option.url"
               :external="option.needFullLoad === true"
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
                        class="st-font-body-normal max-md:text-sm text-accent-300 line-clamp-2">
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
