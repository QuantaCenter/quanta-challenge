<script setup lang="ts">
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { Delete, Edit, HardDisk, Time } from '@icon-park/vue-next';
import { formatFileSize } from '~/utils/format-file-size';
import type { WorkshopProject } from '~/composables/use-workshop-projects';

/** 「我的项目」卡片：点击整页跳转到 IDE，悬停显示重命名 / 删除 */

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const props = defineProps<{ project: WorkshopProject }>();

defineEmits<{
   rename: [];
   delete: [];
}>();

const icon = computed(() => props.project.source === 'github'
   ? '/icons/github-white.png'
   : props.project.template?.icon ?? '/icons/document.png');
const templateName = computed(() => props.project.source === 'github' ? 'GitHub 仓库' : props.project.template?.name ?? '自定义项目');
</script>

<template>
   <!-- IDE 页面跨源隔离，响应头与主站不同，必须整页跳转 -->
   <a
      :href="`/workshop/${project.id}`"
      target="_blank"
      rel="noopener"
      class="group h-full rounded-xl focus-visible:outline-2 focus-visible:outline-secondary">
      <StCard
         class="h-full !rounded-xl !p-3 transition-all hover:ring-secondary/50 active:scale-[0.99] md:active:scale-100">
         <template #header>
            <span class="sr-only">{{ project.name }}</span>
         </template>
         <StSpace fill-x direction="vertical" gap="0.75rem" class="min-w-0 flex-1">
            <!-- 上：图标 + 名称（右侧留出操作按钮位置） -->
            <StSpace fill-x align="center" gap="0.75rem" class="min-w-0 pr-16">
               <img
                  :src="icon"
                  :alt="templateName"
                  class="size-7 shrink-0 object-contain"
                  draggable="false" />
               <h3 class="min-w-0 flex-1 line-clamp-1 text-base leading-6 font-bold">
                  {{ project.name }}
               </h3>
            </StSpace>
            <!-- 下：描述 + 更新时间 / 大小 -->
            <StSpace fill-x direction="vertical" gap="0.5rem" class="min-w-0 flex-1">
               <p
                  v-if="project.githubImport"
                  class="st-font-caption truncate text-accent-300"
                  :title="`${project.githubImport.ownerLogin}/${project.githubImport.repositoryName} · ${project.githubImport.branchName}`">
                  GitHub · {{ project.githubImport.ownerLogin }}/{{ project.githubImport.repositoryName }}
               </p>
               <p
                  v-if="project.description"
                  class="st-font-caption line-clamp-1 text-accent-300">
                  {{ project.description }}
               </p>
               <StSpace
                  align="center"
                  gap="0.875rem"
                  wrap
                  class="mt-auto st-font-caption text-accent-400 max-md:text-xs">
                  <StSpace
                     align="center"
                     gap="0.375rem"
                     :title="dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm')">
                     <Time aria-hidden="true" />
                     <span>{{ dayjs(project.updatedAt).fromNow() }}更新</span>
                  </StSpace>
                  <StSpace align="center" gap="0.375rem">
                     <HardDisk aria-hidden="true" />
                     <span>{{ formatFileSize(project.sizeBytes) }}</span>
                  </StSpace>
               </StSpace>
            </StSpace>
         </StSpace>

         <StSpace
            gap="0.25rem"
            class="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-100">
            <StPopover content="重命名" placement="top">
               <button
                  type="button"
                  aria-label="重命名项目"
                  class="size-7 flex items-center justify-center rounded-md text-accent-300 hover:bg-accent-500 hover:text-white transition-colors cursor-pointer"
                  @click.prevent.stop="$emit('rename')">
                  <Edit />
               </button>
            </StPopover>
            <StPopover content="删除" placement="top">
               <button
                  type="button"
                  aria-label="删除项目"
                  class="size-7 flex items-center justify-center rounded-md text-accent-300 hover:bg-accent-500 hover:text-error transition-colors cursor-pointer"
                  @click.prevent.stop="$emit('delete')">
                  <Delete />
               </button>
            </StPopover>
         </StSpace>
      </StCard>
   </a>
</template>
