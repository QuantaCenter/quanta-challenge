import { useState } from '#imports';
import { onMounted, watch } from 'vue';
type VisitKind = 'article' | 'topic';

import { computed } from 'vue';
import {
   isDoneForever,
   markDoneOnce,
   sortVisitCuids,
   upsertSolved,
   upsertVisit,
   visitStamp,
   type VisitRecord,
} from '~/utils/learning-visits';
import type { VisitSlice } from '~/utils/learning-progress';

/** 「最近学习」的访问记录，按 cuid 存 localStorage */
const STORAGE_KEY = 'quanta-learning-visits-v1';

const emptyMap = (): Record<string, VisitRecord> => ({});

const read = (kind: VisitKind): Record<string, VisitRecord> => {
   if (!import.meta.client) return emptyMap();
   try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${kind}`);
      if (!raw) return emptyMap();
      const parsed = JSON.parse(raw) as Record<string, VisitRecord>;
      return parsed && typeof parsed === 'object' ? parsed : emptyMap();
   } catch {
      return emptyMap();
   }
};

const SOLVED_KEY = `${STORAGE_KEY}:solved`;

const readSolved = (): Record<string, string> => {
   if (!import.meta.client) return {};
   try {
      const raw = localStorage.getItem(SOLVED_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
   } catch {
      return {};
   }
};

const writeSolved = (value: Record<string, string>) => {
   if (!import.meta.client) return;
   try {
      localStorage.setItem(SOLVED_KEY, JSON.stringify(value));
   } catch {
      // 隐私模式：内存里的状态照常生效
   }
};

const DONE_KEY = `${STORAGE_KEY}:done`;

const readDone = (): Record<string, string> => {
   if (!import.meta.client) return {};
   try {
      const raw = localStorage.getItem(DONE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
   } catch {
      return {};
   }
};

const writeDone = (value: Record<string, string>) => {
   if (!import.meta.client) return;
   try {
      localStorage.setItem(DONE_KEY, JSON.stringify(value));
   } catch {
      // 隐私模式：内存里的状态照常生效
   }
};

const writeLocal = (kind: VisitKind, value: Record<string, VisitRecord>) => {
   if (!import.meta.client) return;
   try {
      localStorage.setItem(`${STORAGE_KEY}:${kind}`, JSON.stringify(value));
   } catch {
      // 隐私模式写不进去：内存里的状态照常生效
   }
};

/** 学习进度前端入口，真源在服务端，localStorage 只做兜底与一次性迁移 */
export const useLearningVisits = () => {
   const articles = useState<Record<string, VisitRecord>>(
      'learning-visits-articles',
      emptyMap,
   );
   const topics = useState<Record<string, VisitRecord>>(
      'learning-visits-topics',
      emptyMap,
   );
   const solved = useState<Record<string, string>>(
      'learning-solved-problems',
      () => ({}),
   );
   const done = useState<Record<string, string>>(
      'learning-done-content',
      () => ({}),
   );

   /** 服务端内容是否已经灌进来（客户端用来决定要不要补一次请求） */
   const hydrated = useState<boolean>('learning-progress-hydrated', () => false);

   /** 把服务端进度灌进内存，按 kind 拆分 */
   const hydrateFromServer = (progress: {
      visits: Record<string, string>;
      completions: Record<string, string>;
      solved: number[];
   }) => {
      const nextArticles: Record<string, VisitRecord> = {};
      const nextTopics: Record<string, VisitRecord> = {};
      for (const [key, at] of Object.entries(progress.visits ?? {})) {
         const [kind, targetId] = key.split(':');
         if (!targetId) continue;
         if (kind === 'article') nextArticles[targetId] = { cuid: targetId, at };
         if (kind === 'topic') nextTopics[targetId] = { cuid: targetId, at };
      }
      articles.value = nextArticles;
      topics.value = nextTopics;
      done.value = { ...(progress.completions ?? {}) };
      solved.value = Object.fromEntries(
         (progress.solved ?? []).map((baseId) => [String(baseId), 'server']),
      );
      hydrated.value = true;
   };

   /** 只读兜底：接口不可用时用本地缓存把页面填上 */
   const load = () => {
      if (!import.meta.client || hydrated.value) return;
      articles.value = { ...read('article'), ...articles.value };
      topics.value = { ...read('topic'), ...topics.value };
      solved.value = { ...readSolved(), ...solved.value };
      done.value = { ...readDone(), ...done.value };
   };

   /** 一次写盘（本地兜底缓存） */
   const cacheLocally = () => {
      writeLocal('article', articles.value);
      writeLocal('topic', topics.value);
      writeSolved(solved.value);
      writeDone(done.value);
   };

   /** 把本地历史记录一次性补写进服务端 */
   const migrateLocalToServer = async () => {
      if (!import.meta.client || hydrated.value) return;
      const localArticles = read('article');
      const localTopics = read('topic');
      const localDone = readDone();
      const hasLocal =
         Object.keys(localArticles).length > 0 ||
         Object.keys(localTopics).length > 0 ||
         Object.keys(localDone).length > 0;
      if (!hasLocal) {
         hydrated.value = true;
         return;
      }

      const { $trpc } = useNuxtApp();
      const jobs: Promise<unknown>[] = [];
      for (const cuid of Object.keys(localArticles)) {
         jobs.push(
            $trpc.public.learningProgress.visit.mutate({
               kind: 'article',
               targetId: cuid,
            }),
         );
      }
      for (const cuid of Object.keys(localTopics)) {
         jobs.push(
            $trpc.public.learningProgress.visit.mutate({
               kind: 'topic',
               targetId: cuid,
            }),
         );
      }
      for (const key of Object.keys(localDone)) {
         const [kind, targetId] = key.split(':');
         if (!targetId) continue;
         if (kind === 'article' || kind === 'topic' || kind === 'course') {
            jobs.push(
               $trpc.public.learningProgress.visit.mutate({ kind, targetId }),
            );
         }
      }
      // 完成标记交给服务端校验，不通过就不写
      for (const key of Object.keys(localDone)) {
         const [kind, targetId] = key.split(':');
         if (kind !== 'topic' && kind !== 'course') continue;
         if (!targetId) continue;
         jobs.push(
            $trpc.public.learningProgress.complete
               .mutate({ kind, targetId })
               .catch(() => undefined),
         );
      }

      await Promise.allSettled(jobs);
      hydrated.value = true;
   };

   /** 记一次访问，先更新内存再写服务端 */
   const record = (kind: VisitKind, cuid: string | undefined) => {
      if (!import.meta.client || !cuid) return;
      const target = kind === 'article' ? articles : topics;
      const merged = upsertVisit(target.value, cuid, visitStamp());
      target.value = merged;
      cacheLocally();

      const { $trpc } = useNuxtApp();
      void $trpc.public.learningProgress.visit
         .mutate({ kind, targetId: cuid })
         .catch(() => undefined);
   };

   /** 标记完成，由服务端校验后落库 */
   const markDone = (
      kind: 'article' | 'topic' | 'course',
      cuid?: string,
   ) => {
      if (!import.meta.client || !cuid) return;
      if (done.value[`${kind}:${cuid}`]) return;
      const current = { ...done.value, [`${kind}:${cuid}`]: visitStamp() };
      done.value = current;
      cacheLocally();

      const { $trpc } = useNuxtApp();
      void $trpc.public.learningProgress.complete
         .mutate({ kind, targetId: cuid })
         .catch(() => undefined);
   };

   /** 兼容旧调用，只记一次访问 */
   const markSolved = (baseId: number) => {
      if (!import.meta.client || !Number.isInteger(baseId) || baseId <= 0) return;
      solved.value = upsertSolved(solved.value, baseId, visitStamp());
      cacheLocally();
      const { $trpc } = useNuxtApp();
      void $trpc.public.learningProgress.visit
         .mutate({ kind: 'problem', targetId: String(baseId) })
         .catch(() => undefined);
   };

   const slice = computed<VisitSlice>(() => ({
      articles: articles.value,
      topics: topics.value,
      solved: solved.value,
      done: done.value,
   }));

   return {
      articles,
      topics,
      solved,
      done,
      slice,
      hydrated,
      load,
      hydrateFromServer,
      migrateLocalToServer,
      recordArticle: (cuid?: string) => record('article', cuid),
      recordTopic: (cuid?: string) => record('topic', cuid),
      markDone,
      markSolved,
      recent: (kind: VisitKind) =>
         sortVisitCuids(kind === 'article' ? articles.value : topics.value),
      at: (kind: VisitKind, cuid: string | undefined) =>
         cuid
            ? ((kind === 'article' ? articles.value : topics.value)[cuid]?.at ??
              null)
            : null,
   };
};

/** 页面挂载时记一笔访问，cuid 变化时补记 */
export const useRecordVisit = (kind: VisitKind, cuid: () => string | undefined) => {
   const visits = useLearningVisits();
   onMounted(() => {
      visits.load();
      visits[kind === 'article' ? 'recordArticle' : 'recordTopic'](cuid());
   });
   watch(cuid, (value) => {
      visits[kind === 'article' ? 'recordArticle' : 'recordTopic'](value);
   });
};

/** 达成完成时立刻标记，不可逆 */
export const useMarkContentDone = (options: {
   articleCuid: () => string | undefined;
   articleDone: () => boolean;
   /** 文章所属的全部专题 */
   topicCuids: () => string[];
   /** 专题是否已完成 */
   topicDone: (cuid: string) => boolean;
}) => {
   const visits = useLearningVisits();
   watch(
      () => [
         options.articleCuid(),
         options.articleDone(),
         options.topicCuids().join(','),
      ],
      () => {
         if (import.meta.server) return;
         // 纯阅读文章："读过"就是它的完成态（服务端只校验文章存在）
         if (options.articleDone()) {
            visits.markDone('article', options.articleCuid());
         }
         for (const cuid of options.topicCuids()) {
            if (options.topicDone(cuid)) visits.markDone('topic', cuid);
         }
      },
      { immediate: true },
   );
};
