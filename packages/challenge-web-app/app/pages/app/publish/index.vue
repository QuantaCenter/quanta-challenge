<script setup lang="ts">
import {
   Code,
   DocDetail,
   GoldMedalTwo,
   School,
   TableReport,
   Tag,
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
      description: '编写并发布 JS/TS 函数，供题目代码通过 HTTP 凭令牌调用',
      url: '/app/publish/cloud-function',
      icon: Code,
      iconColor: '#C267FF',
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
      <StSpace direction="vertical" gap="1.5rem" class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">发布流程</h1>

         <StSpace direction="vertical" gap="1.5rem" fill-x>
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
