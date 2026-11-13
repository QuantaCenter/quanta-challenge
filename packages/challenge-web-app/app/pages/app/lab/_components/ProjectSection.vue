<script setup lang="ts">
import { Experiment } from '@icon-park/vue-next';
import type { LabProject } from '~/composables/use-lab-projects';
import ProjectCard from './ProjectCard.vue';

/** 「我的项目」区块：标题与配额、加载骨架、失败重试、空状态、项目卡片网格 */

defineProps<{
   projects: LabProject[] | null | undefined;
   pending: boolean;
   error: unknown;
}>();

defineEmits<{
   retry: [];
   rename: [project: LabProject];
   delete: [project: LabProject];
}>();

const limits = useRuntimeConfig().public.lab;
</script>

<template>
   <StSpace fill-x direction="vertical" gap="1rem">
      <StSpace fill-x align="center" justify="between" gap="1rem">
         <h2 class="text-xl font-bold max-md:text-base">我的项目</h2>
         <span v-if="projects" class="st-font-caption text-accent-400">
            {{ projects.length }} / {{ limits.maxProjectsPerUser }} · 云端保存
         </span>
      </StSpace>

      <StSkeleton :loading="pending && !projects" class="w-full">
         <template #loading>
            <div
               class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 max-md:gap-3">
               <StSkeletonItem
                  v-for="i in 3"
                  :key="i"
                  class="h-[6.5rem] w-full"
                  rounded="lg" />
            </div>
         </template>

         <StSpace
            v-if="error"
            direction="vertical"
            align="center"
            gap="1rem"
            class="w-full py-10 text-accent-300">
            <span>项目加载失败，请重试。</span>
            <StButton bordered size="sm" @click="$emit('retry')">重试</StButton>
         </StSpace>

         <StSpace
            v-else-if="!projects?.length"
            fill-x
            align="center"
            gap="1rem"
            class="rounded-xl border border-dashed border-accent-500 px-5 py-6 text-accent-300">
            <StSpace
               center
               no-shrink
               class="size-12 rounded-lg bg-accent-600 text-accent-200">
               <Experiment size="1.5rem" />
            </StSpace>
            <StSpace direction="vertical" gap="0.25rem">
               <span class="font-bold text-accent-100">还没有项目</span>
               <span class="st-font-caption">
                  从下方选择一个模板，查看介绍与目录结构后即可创建，项目会长期保存在云端。
               </span>
            </StSpace>
         </StSpace>

         <div
            v-else
            class="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 max-md:gap-3">
            <ProjectCard
               v-for="project in projects"
               :key="project.id"
               :project="project"
               @rename="$emit('rename', project)"
               @delete="$emit('delete', project)" />
         </div>
      </StSkeleton>
   </StSpace>
</template>
