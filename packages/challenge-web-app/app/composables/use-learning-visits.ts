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
import type { VisitSlice } from '~/composables/use-learning';

/**
 * 「最近学习」的访问记录。
 *
 * 为什么需要它：`最近学习` 依赖"这个专题/文章什么时候被打开过"。
 * 切换数据源时这里出过一个坑——记录是写死的常量，而且 id 按
 * 「第 n 篇 = 100 + n」编；文章改成服务端 cuid 后（前端 id 是 cuid 的哈希），
 * 那些写死的 id 一条都匹配不上，于是列表永远为空。
 *
 * 现在的做法：打开文章/专题时**真的记一笔**，只存在本地。
 *   · 只存本地（localStorage）是对的：这是"我这台设备上的浏览历史"，
 *     不是内容本身，不需要落库，也不该跨设备同步；
 *   · 按 `cuid`（服务端主键）存，而不是那个哈希出来的数字 id——
 *     cuid 永远不会变，数字 id 只是展示用的映射。
 */
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

/**
 * 学习进度（访问 / 完成 / 已做过的题）的**前端入口**。
 *
 * 真源在服务端（`public.learningProgress.*`，表 `learning_visits` /
 * `learning_completions`，"做过"由成功提交记录推导）。本地 localStorage 只做两件事：
 *   1. 接口不可用时的兜底显示；
 *   2. **一次性迁移**：之前只存在本地的记录，登录后补写进服务端。
 *
 * 对外形状保持不变（`slice.value` 仍是 `VisitSlice`），
 * 所以进度计算那套纯函数一行都不用改。
 */
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

   /**
    * 把服务端进度灌进内存。
    *
    * 服务端按 `kind:targetId` 存；这里拆回三份：
    *   · `article:` / `topic:` → 访问时间
    *   · `article:` / `topic:` / `course:` 的完成 → done
    *   · solved 是题号列表
    */
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

   /**
    * 把本地历史记录补写进服务端（**一次性**，登录后第一次加载时做）。
    *
    * 为什么要迁移：这些记录以前只存在浏览器里，落库之后不能让用户"进度清零"。
    * 迁移完就在本地打个标记，避免每次登录都重放。
    */
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
      // 完成标记交给服务端校验：不通过就不写（宁缺毋滥）
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

   /** 记一次访问：先更新内存，再写服务端（失败只影响权威性，不影响本次浏览） */
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

   /**
    * 标记完成：**由服务端校验**后落库（见 learning-progress.ts）。
    * 服务端拒绝（其实还没完成）就忽略——下次真正达成时再标。
    */
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

   /** 兼容旧调用：题目的"做过"改由提交记录推导，这里只记一次访问 */
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

/**
 * 页面挂载时记一笔访问。
 *
 * 只在客户端执行（localStorage 不存在于服务端）；cuid 变化时补记一次，
 * 这样在同一标签页里切换文章也能被记上。
 */
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

/**
 * 达成完成时**立刻写死**（不可逆）。
 *
 * 为什么要在页面里显式记一笔：不可逆的完成状态必须有明确的"达成时刻"，
 * 否则一旦题目更新版本、分母变大，重新计算就会从"完成"退回"未完成"。
 * 这里在页面观察进度：达成的当下把文章 / 专题的 cuid 写进本地记录。
 */
export const useMarkContentDone = (options: {
   articleCuid: () => string | undefined;
   articleDone: () => boolean;
   /** 这篇文章所属的全部专题（同一篇可能被多个专题收录） */
   topicCuids: () => string[];
   /** 某个专题是否已因"题目全部做完"而达成 */
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
