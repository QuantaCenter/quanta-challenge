<script setup lang="ts">
import { CheckOne, Lock } from '@icon-park/vue-next';
import LearningPlayground from './LearningPlayground.vue';
import MarkdownSegment from './MarkdownSegment.vue';
import ProblemBlock from './ProblemBlock.vue';

interface ArticleProblem {
   baseId: number;
   problemId: number | null;
   title: string | null;
   difficulty: string | null;
   totalScore: number | null;
   completed: boolean;
   tags: { name: string; color: string | null }[];
   coverImageName: string | null;
   coverImageThumbhash: string | null;
}

interface ArticlePlayground {
   id: string;
   title: string;
   html: string;
   css: string;
   js: string;
}

const props = defineProps<{
   source: string;
   problems: ArticleProblem[];
   playgrounds: ArticlePlayground[];
   isRead: boolean;
   percent: number;
   marking?: boolean;
}>();

defineEmits<{ markRead: [] }>();

type Segment =
   | { type: 'markdown'; source: string; key: string }
   | { type: 'problem'; baseId: number; key: string }
   | { type: 'playground'; id: string; key: string };

const segments = computed<Segment[]>(() => {
   const result: Segment[] = [];
   const directive =
      /<(?:Problem\s+baseId=\{\d+\}|Playground\s+id=(?:"[^"]+"|'[^']+'))\s*\/>/g;
   let cursor = 0;
   let match: RegExpExecArray | null;

   while ((match = directive.exec(props.source)) !== null) {
      if (match.index > cursor) {
         result.push({
            type: 'markdown',
            source: props.source.slice(cursor, match.index),
            key: `markdown-${cursor}`,
         });
      }
      const raw = match[0];
      const baseId = raw.match(/baseId=\{(\d+)\}/)?.[1];
      const playgroundId = raw.match(/id=(?:"([^"]+)"|'([^']+)')/)?.slice(1).find(Boolean);
      if (baseId) {
         result.push({
            type: 'problem',
            baseId: Number(baseId),
            key: `problem-${match.index}`,
         });
      } else if (playgroundId) {
         result.push({
            type: 'playground',
            id: playgroundId,
            key: `playground-${match.index}`,
         });
      }
      cursor = directive.lastIndex;
   }

   if (cursor < props.source.length) {
      result.push({
         type: 'markdown',
         source: props.source.slice(cursor),
         key: `markdown-${cursor}`,
      });
   }
   return result;
});

const problemByBaseId = computed(
   () => new Map(props.problems.map((problem) => [problem.baseId, problem])),
);
const playgroundById = computed(
   () => new Map(props.playgrounds.map((playground) => [playground.id, playground])),
);

const endSentinel = ref<HTMLElement | null>(null);
const reachedEnd = ref(false);
let observer: IntersectionObserver | undefined;

onMounted(() => {
   if (!endSentinel.value) return;
   observer = new IntersectionObserver(
      ([entry]) => {
         if (entry?.isIntersecting) {
            reachedEnd.value = true;
            observer?.disconnect();
         }
      },
      { threshold: 0.5 },
   );
   observer.observe(endSentinel.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
   <div>
      <template v-for="segment in segments" :key="segment.key">
         <MarkdownSegment
            v-if="segment.type === 'markdown' && segment.source.trim()"
            :source="segment.source" />
         <ProblemBlock
            v-else-if="segment.type === 'problem' && problemByBaseId.get(segment.baseId)"
            v-bind="problemByBaseId.get(segment.baseId)!" 
            class="my-8" />
         <LearningPlayground
            v-else-if="segment.type === 'playground' && playgroundById.get(segment.id)"
            v-bind="playgroundById.get(segment.id)!" />
      </template>

      <div ref="endSentinel" class="h-px" aria-hidden="true"></div>

      <StCard class="mt-12 !h-auto !p-6 text-center">
         <CheckOne v-if="isRead" class="mx-auto text-3xl text-success" />
         <Lock v-else class="mx-auto text-3xl text-accent-300" />
         <h2 class="mt-3 font-bold text-white">
            {{ isRead ? '文章已读' : reachedEnd ? '已阅读到文末' : '继续阅读以完成文章' }}
         </h2>
         <p class="mt-1 text-sm text-accent-300">
            {{ isRead ? `当前文章学习进度 ${percent}%` : '阅读到文末后即可标记为已读' }}
         </p>
         <StButton
            class="mx-auto mt-4 min-w-40"
            :disabled="!reachedEnd || isRead || marking"
            :loading="marking"
            @click="$emit('markRead')">
            {{ isRead ? '已标记为已读' : marking ? '正在保存' : '标记为已读' }}
         </StButton>
      </StCard>
   </div>
</template>
