<script setup lang="ts">
import {
   Box,
   Code,
   DocDetail,
   GoldMedalTwo,
   School,
   TableReport,
   Tag,
   Timer,
   VolumeNotice,
} from '@icon-park/vue-next';
import PublishOptionCard from './_components/PublishOptionCard.vue';

useSeoMeta({ title: '发布流程 - Quanta Challenge' });

const options = [
   {
      title: '创建标签',
      description: '创建新的题目标签，并为标签配置颜色与图标',
      url: '/app/publish/create-tag',
      icon: Tag,
      iconColor: '#FE4E4E',
   },
   {
      title: '发布题目',
      description: '创建一个新的判题流程，并配置题目的基本信息',
      url: '/app/publish/problem',
      icon: TableReport,
      iconColor: '#C1EF3F',
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
];

const tailOptions = [
   {
      title: '创建成就',
      description: '创建一个新的成就，并配置成就的基本信息',
      url: '/app/publish/achievement',
      icon: GoldMedalTwo,
      iconColor: '#F59E0B',
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

/** 学习内容相关入口：文章是一等实体，专题引用文章，课程集合专题 */
const contentOptions = [
   {
      title: '发布文章',
      description: '创建一篇新文章，并可在正文中插入题库中的题目',
      url: '/app/publish/article/new',
      icon: DocDetail,
      iconColor: '#4ADE80',
   },
   {
      title: '创建课程',
      description: '创建一门新课程，编排专题并组织文章，构成完整的学习路径',
      url: '/app/publish/course',
      icon: School,
      iconColor: '#F472B6',
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
            <PublishOptionCard v-for="option in options" :key="option.title" v-bind="option" />

            <PublishOptionCard v-for="option in tailOptions" :key="option.title" v-bind="option" />
         </StSpace>

         <h2 class="st-font-third-bold text-white">内容创作</h2>

         <StSpace direction="vertical" gap="1.5rem" fill-x>
            <PublishOptionCard v-for="option in contentOptions" :key="option.title" v-bind="option" />
         </StSpace>

      </StSpace>
   </StSpace>
</template>
