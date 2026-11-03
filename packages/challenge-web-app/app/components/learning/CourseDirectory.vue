<script setup lang="ts">
import { FileText, FileCode, Round, CheckOne, Lock } from '@icon-park/vue-next';
import type { DirectoryChapter } from '~/types/course-directory';

const props = withDefaults(defineProps<{
   chapters: DirectoryChapter[];
   interactive?: boolean;
   activeChapterId?: string;
   activeSectionId?: string;
   /** 可交互子节背景向目录内容区域两侧延伸的像素数。 */
   edgePadding?: number;
   showProgressPercentage?: boolean;
   showBranches?: boolean;
   showChapterBadge?: boolean;
   showChapterHeader?: boolean;
   itemPaddingRight?: string;
}>(), {
   interactive: false,
   edgePadding: 0,
   showProgressPercentage: true,
   showBranches: true,
   showChapterBadge: true,
   showChapterHeader: true,
   itemPaddingRight: '0px',
});
const sectionStyle = computed(() => {
   if (!props.interactive) return undefined;
   const padding = Number.isFinite(props.edgePadding) ? Math.max(0, props.edgePadding) : 0;
   const indent = props.showBranches ? '1.125rem' : '0rem';
   const contentIndent = props.showBranches ? '2.625rem' : '0rem';
   return {
      marginLeft: `calc(0rem - ${indent} - ${padding}px)`,
      width: `calc(100% + ${indent} + ${padding * 2}px)`,
      paddingLeft: `calc(${contentIndent} + ${padding}px)`,
      paddingRight: `calc(${padding}px + ${props.itemPaddingRight})`,
   };
});
const emit = defineEmits<{
   chapter: [id: string];
   section: [id: string];
}>();
function percentage(chapter: DirectoryChapter) {
   return chapter.sections.length
      ? chapter.sections.filter(section => section.completed).length / chapter.sections.length * 100
      : 0;
}
</script>

<template>
   <StEmptyStatus v-if="!chapters.length" content="暂无章节" class="min-h-[10rem]" />
   <ul v-else class="w-full divide-y divide-accent-500">
      <li v-for="(chapter, index) in chapters" :key="chapter.id" class="my-0 py-4 first:pt-0 last:pb-0">
         <StSpace v-if="showChapterHeader" align="center" gap="0.5rem" fill-x class="min-w-0">
            <span
               v-if="showChapterBadge"
               :aria-label="`第 ${index + 1} 章`"
               class="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 px-2 text-xs font-bold font-family-manrope tabular-nums text-accent-200">
               {{ index + 1 }}
            </span>
            <h2 class="my-0 min-w-0 flex-1 break-words text-lg font-medium">
               <component
                  :is="interactive ? 'button' : 'span'"
                  :type="interactive ? 'button' : undefined"
                  :disabled="interactive && chapter.unlocked === false"
                  :aria-current="interactive && !activeSectionId && activeChapterId === chapter.id ? 'page' : undefined"
                  class="text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  :class="{ 'text-primary': interactive && !activeSectionId && activeChapterId === chapter.id, 'hover:text-primary': interactive }"
                  @click="interactive && chapter.unlocked !== false && emit('chapter', chapter.id)">
                  {{ chapter.title }}
               </component>
            </h2>
            <span
               v-if="interactive && chapter.unlocked === false"
               class="flex w-8 shrink-0 items-center justify-center text-accent-400">
               <Lock aria-label="未解锁" />
            </span>
            <StCircularProgress
               v-else
               class="w-8"
               :percentage="percentage(chapter)"
               :size="20"
               :stroke-width="12"
               :show-percentage="showProgressPercentage"
               label-position="bottom"
               :label-size="12"
               :gap="4"
               :label="`${chapter.title}完成进度`" />
         </StSpace>
         <ul :class="{ 'mt-2': showChapterHeader, 'ml-[1.125rem]': showBranches }">
            <li
               v-for="section in chapter.sections"
               :key="section.id"
               class="relative pb-1 last:pb-0 before:pointer-events-none before:absolute before:bottom-0 before:left-0 before:top-0 before:z-10 before:border-l before:border-accent-500 after:pointer-events-none after:absolute after:left-0 after:top-0 after:z-10 after:h-5 after:w-4 after:rounded-bl-lg after:border-b after:border-l after:border-accent-500 last:before:hidden"
               :class="{
                  'before:!border-accent-400 after:!border-accent-400': interactive && activeSectionId === section.id,
                  'before:hidden after:hidden': !showBranches,
               }">
               <component
                  :is="interactive ? 'button' : 'div'"
                  :type="interactive ? 'button' : undefined"
                  :disabled="interactive && section.unlocked === false"
                  :aria-current="interactive && activeSectionId === section.id ? 'page' : undefined"
                  :style="sectionStyle"
                  class="flex min-h-10 w-full items-center gap-2 rounded-lg py-2 pl-6 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  :class="{ 'bg-accent-500': interactive && activeSectionId === section.id, 'hover:bg-accent-500': interactive, '!pl-0': !interactive && !showBranches }"
                  @click="interactive && section.unlocked !== false && emit('section', section.id)">
                  <FileText v-if="section.type === 'article'" aria-hidden="true" class="shrink-0 text-base text-accent-300" />
                  <FileCode v-else aria-hidden="true" class="shrink-0 text-base text-primary" />
                  <span class="sr-only">{{ section.type === 'article' ? '文章：' : '题目：' }}</span>
                  <span
                     class="st-font-body-normal min-w-0 flex-1 break-words"
                     :class="interactive && activeSectionId === section.id ? 'text-primary' : 'text-accent-200'">
                     {{ section.title }}
                  </span>
                  <Lock v-if="interactive && section.unlocked === false" aria-label="未解锁" class="mr-2 shrink-0 text-base text-accent-400" />
                  <CheckOne v-else-if="section.completed" aria-label="已完成" class="mr-2 shrink-0 text-base text-success" />
                  <Round v-else aria-label="未完成" class="mr-2 shrink-0 text-base text-accent-400" />
               </component>
            </li>
         </ul>
      </li>
   </ul>
</template>
