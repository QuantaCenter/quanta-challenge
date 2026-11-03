<script setup lang="ts">
import {
   ArrowDown,
   ArrowUp,
   Attention,
   Code,
   Delete,
   DocDetail,
   Down,
   Edit,
   Peoples,
   Plus,
   Right,
} from '@icon-park/vue-next';
import OutlineIconButton from './OutlineIconButton.vue';
import type {
   AdminCourseChapter,
   AdminCourseSection,
   AdminCourseStage,
   CourseOutlineKind,
} from '~/types/course-admin';

const props = defineProps<{
   chapter: AdminCourseChapter;
   index: number;
   total: number;
   busyId: string | null;
   issueSectionIds: Set<string>;
   hasIssue: boolean;
}>();

const emits = defineEmits<{
   move: [kind: CourseOutlineKind, id: string, direction: 'up' | 'down'];
   editChapter: [];
   removeChapter: [];
   addStage: [];
   removeStage: [stage: AdminCourseStage, label: string];
   addSection: [stageId: string, location: string];
   editSection: [stageId: string, location: string, section: AdminCourseSection];
   removeSection: [section: AdminCourseSection];
}>();

const expanded = ref(true);

const chapterLabel = computed(() => `第 ${props.index + 1} 章`);
const sectionCount = computed(() =>
   props.chapter.stages.reduce((total, stage) => total + stage.sections.length, 0),
);
const stageLocation = (stageIndex: number) => `${chapterLabel.value} · 阶段 ${stageIndex + 1}`;

const difficultyLabels: Record<string, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '非常困难',
};

const sectionMeta = (section: AdminCourseSection) => {
   if (section.type === 'problem') {
      const problem = section.baseProblem?.CurrentProblem;
      if (!problem) return '题目暂无可用版本';
      const difficulty = difficultyLabels[problem.difficulty] ?? '';
      return `#${problem.pid} ${problem.title}${difficulty ? ` · ${difficulty}` : ''}`;
   }
   const words = (section.articleContent ?? '').replace(/\s/g, '').length;
   return words ? `${words} 字` : '正文为空';
};

const isBusy = (id: string) => props.busyId === id;
const locked = computed(() => !!props.busyId);
</script>

<template>
   <article
      class="w-full overflow-hidden rounded-xl border bg-accent-700/40 transition-colors"
      :class="hasIssue ? 'border-warning/40' : 'border-accent-500'">
      <!-- 章节头 -->
      <header
         class="flex w-full items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-accent-600/40 transition-colors max-md:px-3"
         @click="expanded = !expanded">
         <Component
            :is="expanded ? Down : Right"
            class="shrink-0 text-accent-300 text-[1.125rem]" />
         <span
            class="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 st-font-caption font-bold text-primary">
            {{ chapterLabel }}
         </span>
         <StSpace direction="vertical" gap="0.125rem" class="min-w-0 flex-1">
            <h3 class="st-font-body-bold truncate text-white">{{ chapter.title }}</h3>
            <span class="st-font-caption text-accent-400">
               {{ chapter.stages.length }} 个阶段 · {{ sectionCount }} 个小节
               <template v-if="chapter.introduction"> · 含导读</template>
            </span>
         </StSpace>
         <StSpace align="center" gap="0.125rem" class="shrink-0" @click.stop>
            <OutlineIconButton
               :icon="ArrowUp"
               label="上移章节"
               :disabled="index === 0 || locked"
               @click="emits('move', 'chapter', chapter.id, 'up')" />
            <OutlineIconButton
               :icon="ArrowDown"
               label="下移章节"
               :disabled="index === total - 1 || locked"
               @click="emits('move', 'chapter', chapter.id, 'down')" />
            <OutlineIconButton :icon="Edit" label="编辑章节" :disabled="locked" @click="emits('editChapter')" />
            <OutlineIconButton
               :icon="Delete"
               label="删除章节"
               danger
               :disabled="locked"
               @click="emits('removeChapter')" />
         </StSpace>
      </header>

      <!-- 阶段与小节 -->
      <div v-show="expanded" class="flex flex-col gap-3 border-t border-accent-600 px-4 py-4 max-md:px-3">
         <section
            v-for="(stage, stageIndex) in chapter.stages"
            :key="stage.id"
            class="relative flex flex-col gap-2 rounded-lg border border-dashed border-accent-500 p-3"
            :class="{ 'opacity-60 pointer-events-none': isBusy(stage.id) }">
            <div class="flex items-center gap-2">
               <span class="st-font-caption font-bold text-accent-200">阶段 {{ stageIndex + 1 }}</span>
               <span class="st-font-caption text-accent-400 max-md:hidden">· 本阶段小节同时解锁</span>
               <span class="flex-1" />
               <OutlineIconButton
                  :icon="ArrowUp"
                  label="上移阶段"
                  :disabled="stageIndex === 0 || locked"
                  @click="emits('move', 'stage', stage.id, 'up')" />
               <OutlineIconButton
                  :icon="ArrowDown"
                  label="下移阶段"
                  :disabled="stageIndex === chapter.stages.length - 1 || locked"
                  @click="emits('move', 'stage', stage.id, 'down')" />
               <OutlineIconButton
                  :icon="Delete"
                  label="删除阶段"
                  danger
                  :disabled="locked"
                  @click="emits('removeStage', stage, stageLocation(stageIndex))" />
            </div>

            <ul class="flex flex-col gap-1.5">
               <li
                  v-for="(section, sectionIndex) in stage.sections"
                  :key="section.id"
                  class="group flex items-center gap-3 rounded-lg bg-accent-600/70 px-3 py-2.5 transition-colors hover:bg-accent-600 cursor-pointer"
                  :class="{ 'opacity-60 pointer-events-none': isBusy(section.id) }"
                  @click="emits('editSection', stage.id, stageLocation(stageIndex), section)">
                  <span
                     class="flex size-8 shrink-0 items-center justify-center rounded-lg"
                     :class="
                        section.type === 'article'
                           ? 'bg-primary/15 text-primary'
                           : 'bg-[#4CA7FF]/15 text-[#4CA7FF]'
                     ">
                     <DocDetail v-if="section.type === 'article'" />
                     <Code v-else />
                  </span>
                  <StSpace direction="vertical" gap="0.125rem" class="min-w-0 flex-1">
                     <StSpace align="center" gap="0.5rem" class="min-w-0">
                        <span class="st-font-body-normal truncate text-white">{{ section.title }}</span>
                        <Attention
                           v-if="issueSectionIds.has(section.id)"
                           class="shrink-0 text-warning"
                           title="发布检查未通过" />
                     </StSpace>
                     <span
                        class="st-font-caption truncate"
                        :class="issueSectionIds.has(section.id) ? 'text-warning' : 'text-accent-400'">
                        {{ section.type === 'article' ? '图文' : '实践题' }} · {{ sectionMeta(section) }}
                     </span>
                  </StSpace>
                  <span
                     v-if="section._count.progress"
                     class="flex shrink-0 items-center gap-1 st-font-caption text-accent-300 max-md:hidden"
                     :title="`${section._count.progress} 名学员已完成`">
                     <Peoples />
                     {{ section._count.progress }}
                  </span>
                  <StSpace
                     align="center"
                     gap="0.125rem"
                     class="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity max-md:opacity-100"
                     @click.stop>
                     <OutlineIconButton
                        :icon="ArrowUp"
                        label="上移小节"
                        :disabled="sectionIndex === 0 || locked"
                        @click="emits('move', 'section', section.id, 'up')" />
                     <OutlineIconButton
                        :icon="ArrowDown"
                        label="下移小节"
                        :disabled="sectionIndex === stage.sections.length - 1 || locked"
                        @click="emits('move', 'section', section.id, 'down')" />
                     <OutlineIconButton
                        :icon="Delete"
                        label="删除小节"
                        danger
                        :disabled="locked"
                        @click="emits('removeSection', section)" />
                  </StSpace>
               </li>
            </ul>

            <button
               type="button"
               class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 st-font-caption transition-colors cursor-pointer"
               :class="
                  stage.sections.length
                     ? 'border-accent-500 text-accent-300 hover:border-primary/60 hover:text-primary'
                     : 'border-warning/50 text-warning hover:bg-warning/5'
               "
               :disabled="locked"
               @click="emits('addSection', stage.id, stageLocation(stageIndex))">
               <Plus />
               {{ stage.sections.length ? '添加小节' : '阶段还是空的，添加第一个小节' }}
            </button>
         </section>

         <p
            v-if="!chapter.stages.length"
            class="rounded-lg border border-dashed border-warning/50 px-4 py-3 text-center st-font-caption text-warning">
            本章还没有学习阶段，先添加一个阶段
         </p>

         <StSpace justify="start">
            <StButton
               bordered
               theme="secondary"
               size="sm"
               :loading="isBusy(chapter.id)"
               :disabled="locked && !isBusy(chapter.id)"
               class="!py-1.5 !px-3 !border"
               @click="emits('addStage')">
               <div class="flex items-center gap-1.5 st-font-caption">
                  <Plus />
                  <span>添加阶段</span>
               </div>
            </StButton>
         </StSpace>
      </div>
   </article>
</template>
