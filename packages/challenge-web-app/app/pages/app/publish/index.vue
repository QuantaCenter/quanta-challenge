<script setup lang="ts">
import {
   BookOne,
   Code,
   DocDetail,
   FileCollection,
   GoldMedalTwo,
   Right,
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

const articleEntry = {
   title: '发布文章',
   description: '写正文并插入题库中的题目——文章是内容的原子，独立于专题存在',
   url: '/app/publish/article',
   icon: DocDetail,
   iconColor: '#4ADE80',
};

/** 三张表的统一入口：在哪改、被谁引用，都在这一页里看 */
const contentEntry = {
   title: '内容库',
   description: '课程 / 专题 / 文章放在一起：直达编辑页，含待审核的课程',
   url: '/app/publish/content',
   icon: FileCollection,
   iconColor: '#38BDF8',
};

const articleChildren = [
   {
      title: '创建专题',
      description: '专题引用文章：把若干篇文章组织成一个知识领域，例如「布局」',
      url: '/app/publish/topic',
      icon: BookOne,
      iconColor: '#38BDF8',
   },
   {
      title: '创建课程',
      description: '课程集合专题：把若干专题编成一门可完整学完的课程，例如「CSS」',
      url: '/app/publish/course',
      icon: School,
      iconColor: '#F472B6',
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
];

const expanded = ref(false);
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace direction="vertical" gap="1.5rem" class="w-[44rem] pb-[10rem] my-6">
         <h1 class="st-font-hero-bold">发布流程</h1>

         <StSpace direction="vertical" gap="1.5rem" fill-x>
            <PublishOptionCard v-for="option in options" :key="option.title" v-bind="option" />

            <PublishOptionCard v-bind="contentEntry" />

            <div class="relative w-full">
               <button type="button" :title="expanded ? '收起专题与课程' : '展开创建专题与创建课程'" :aria-label="expanded ? '收起' : '展开'"
                  :aria-expanded="expanded"
                  class="absolute -left-12 top-1/2 -translate-y-1/2 mr-3 flex items-center justify-center size-9 rounded-[0.5rem] border transition-colors cursor-pointer"
                  :class="expanded
                     ? 'border-secondary text-secondary'
                     : 'border-accent-300 text-accent-300 hover:border-secondary hover:text-secondary'
                     " @click="expanded = !expanded">
                  <Right size="1.125rem" :strokeWidth="3" class="transition-transform duration-200"
                     :class="expanded ? 'rotate-90' : ''" />
               </button>
               <PublishOptionCard v-bind="articleEntry" />
            </div>

            <div v-if="expanded" class="relative w-full">
               <!-- 树状连接线 -->
               <StSpace direction="vertical" gap="1rem" fill-x>
                  <PublishOptionCard v-for="option in articleChildren" :key="option.title" v-bind="option" />
               </StSpace>
            </div>

            <PublishOptionCard v-for="option in tailOptions" :key="option.title" v-bind="option" />
         </StSpace>

      </StSpace>
   </StSpace>
</template>
