import { onBeforeUnmount, onMounted, unref, watch } from 'vue';
import { useState, useRequestEvent } from '#imports';
import type {
   LearningArticle,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';
import {
   cloneContent,
   createSeedContent,
   pruneDanglingRefs,
   type ArticleInput,
   type CourseInput,
   type LearningContentState,
   type TopicInput,
} from '~/utils/learning-content-ops';
import { fetchLearningContent } from '~/utils/learning-content-source';

/**
 * 学习内容的**状态层**：把纯操作（`~/utils/learning-content-ops`）接到 Vue 状态与 localStorage。
 *
 * 这一版还没有后端模型（设计文档 §6、§10 里课程 / 专题 / 文章都未落库），
 * 所以内容存在浏览器 localStorage 里，形状与将来要落库的字段一一对应：
 * 写在这里的字段就是将来接口要收的字段，页面不需要为「接后端」再改一遍。
 *
 * 三个约定：
 *   1. 文章正文的真源是 Markdown（含 `<Problem baseId={…} />`），
 *      `content` 方块与 `problems` 列表都是**从正文解析出来的派生数据**；
 *   2. 专题 `articleIds` 与课程 `topicIds` 都是**引用**，被引用者独立存在；
 *   3. 初始内容来自 `learning-content.ts`，用户新增的内容追加在后面，id 取当前最大值 +1。
 */

// v2：修掉了新内容 id 与初始内容撞号的问题（见 learning-content-ops 的 nextId），
// 旧键里的快照带着撞号的 id，必须作废重来。
const STORAGE_KEY = 'quanta-learning-content-v2';
// 之前用过的键：改键名不能等于「清空用户内容」，所以还要回头读一遍旧键
const LEGACY_STORAGE_KEYS = ['quanta-learning-content-v1'];
/** 还没写过 localStorage 时的版本号（首次打开，内存里就是种子内容） */
const SEED_VERSION = 'seed';

const readStorage = (): LearningContentState | null => {
   try {
      const raw =
         localStorage.getItem(STORAGE_KEY) ??
         LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(
            (value) => value !== null,
         ) ??
         null;
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<LearningContentState>;
      if (
         !Array.isArray(parsed.articles) ||
         !Array.isArray(parsed.topics) ||
         !Array.isArray(parsed.courses)
      ) {
         return null;
      }
      return pruneDanglingRefs({
         articles: parsed.articles,
         topics: parsed.topics,
         courses: parsed.courses,
      });
   } catch {
      return null;
   }
};

/**
 * localStorage 里的内容是否真的变了。
 *
 * 每次写盘都会带一个新的 `updatedAt`，读取端比对它就够——
 * 不必逐个字段比较（内容可能很大），也不会因为「内容恰好相同」而漏更新。
 */
const readStored = (): (LearningContentState & { updatedAt: string }) | null => {
   const state = readStorage();
   if (!state) return null;
   let updatedAt = '';
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      updatedAt = raw ? (JSON.parse(raw).updatedAt ?? '') : '';
   } catch {
      updatedAt = '';
   }
   return { ...state, updatedAt };
};

export const useLearningContentStore = () => {
   /**
    * 初始值的三层来源（后面的覆盖前面的）：
    *   1. `learning-content.ts` 的种子内容 —— 只保证"永远有东西可渲染"；
    *   2. **服务端预取**（`server/plugins/learning-content.ts` 放进 event.context）——
    *      SSR 首帧就是库里的内容，不会闪一下种子；
    *   3. 客户端的本地缓存 —— 接口不可用时的兜底（见下面的 sync）。
    */
   const prefetched = (): LearningContentState | null => {
      if (!import.meta.server) return null;
      const context = useRequestEvent()?.context as
         | { learningContent?: LearningContentState }
         | undefined;
      return context?.learningContent ?? null;
   };

   const initial = (pick: (state: LearningContentState) => unknown) => {
      const pre = prefetched();
      if (pre) return pick(pre);
      return pick(cloneContent(createSeedContent()));
   };

   const articles = useState<LearningArticle[]>(
      'learning-content-articles',
      () => initial((state) => state.articles) as LearningArticle[],
   );
   const topics = useState<LearningTopic[]>('learning-content-topics', () =>
      initial((state) => state.topics) as LearningTopic[],
   );
   const courses = useState<LearningCourse[]>('learning-content-courses', () =>
      initial((state) => state.courses) as LearningCourse[],
   );

   /**
    * 内存里的这份状态对应哪一次写盘。
    *
    * 关键点：它必须住在 `useState` 里，而不是模块作用域。
    * 模块作用域的标记在 SSR 与客户端是两个实例，刷新页面时就对不上了；
    * 而放在 state 里，SSR → 客户端水合会带着同一个版本号，
    * 于是「第一次挂载要不要读 localStorage」这个判断才有意义。
    */
   const version = useState<string>('learning-content-version', () => '');

   const apply = (state: LearningContentState) => {
      articles.value = state.articles;
      topics.value = state.topics;
      courses.value = state.courses;
   };

   /**
    * 与本地缓存对齐（**兜底**，不是真源）。
    *
    * 真源是服务端：内容由 `plugin/learning-content.ts` 在启动时灌进来。
    * 这里只在「服务端还没回来 / 接口失败」时用本地缓存把页面填上；
    * 绝不用种子内容覆盖内存（那会丢掉用户内容）。
    */
   const sync = () => {
      if (!import.meta.client) return;
      if (version.value.startsWith('server:')) return;
      const stored = readStored();
      if (!stored) return;
      if (stored.updatedAt === version.value) return;
      version.value = stored.updatedAt;
      apply(stored);
   };

   /**
    * 真源在服务端，所以「回到标签页」时要重新拉一次：
    * 期间可能有人下架了题、改了文章、通过了课程审核。
    *
    * 节流 5 秒，避免在标签页之间反复切换时打接口。
    */
   let lastServerSync = 0;
   const syncFromServer = async (options: { force?: boolean } = {}) => {
      if (!import.meta.client) return;
      const now = Date.now();
      if (!options.force && now - lastServerSync < 5000) return;
      lastServerSync = now;
      const state = await loadFromServer();
      if (state) {
         version.value = 'server';
         apply(state);
         persistLocal(state);
      }
   };

   if (import.meta.client) {
      onMounted(() => {
         sync();
         window.addEventListener('storage', sync);
         // 回到标签页：以服务端为准刷一次（题目下架 / 内容变更都能及时反映）
         const onFocus = () => void syncFromServer({ force: true });
         window.addEventListener('focus', onFocus);
         onBeforeUnmount(() => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('focus', onFocus);
         });
      });

      // 路由变化时也对齐一次：从一个页面改完内容回到列表页（或反过来），
      // 读到的必须是刚写进去的那份，而不是上一个页面留下的内存快照。
      const router = useRouter();
      watch(
         () => router.currentRoute.value.fullPath,
         () => sync(),
      );
   }

   /**
    * 内容切片：给纯读函数（`topicProgress` 等）用的普通对象。
    *
    * 页面里请用 `content.slice.value`，不要在 computed 里直接读 store 的 ref
    * ——那些读函数会被 computed 调用，传普通对象最稳。
    */
   const slice = computed(() => ({
      articles: articles.value,
      topics: topics.value,
      courses: courses.value,
   }));

   const snapshot = (): LearningContentState => ({
      articles: articles.value,
      topics: topics.value,
      courses: courses.value,
   });

   /**
    * 把服务端内容灌进状态。
    *
    * 真源在服务端（`public.learning.*`），这里只是把它落到三个 ref 上；
    * `version` 用来避免重复灌同一份数据（接口在页面/插件里可能被调多次）。
    */
   const hydrateFromServer = (state: LearningContentState, versionKey: string) => {
      // 每次都应用：SSR 的预取与客户端的兜底刷新各来一次，
      // 若在客户端这次短路（只比 versionKey），就会出现"明明是新的却不生效"
      // —— 表现是「该题目不可用」闪一下又变回可用。
      version.value = versionKey;
      apply(state);
      // 顺手留一份本地副本：断网 / 接口挂掉时页面还能显示上次的内容
      persistLocal(state);
   };

   const persistLocal = (state: LearningContentState) => {
      const updatedAt = new Date().toISOString();
      try {
         localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...state, updatedAt }),
         );
      } catch {
         // 隐私模式写不进去：内存里的状态照常生效
      }
   };

   /**
    * 本地副本（**只读缓存**，不是真源）。
    *
    * 以前这里是唯一真源，所以会出现「换台机器内容就没了」；
    * 现在服务端才是真源，本地这份只在接口不可用时兜底显示。
    */
   const persist = () => persistLocal(snapshot());

   /**
    * 写操作统一走这里：
    *   · 有登录态 → 调服务端 mutation（返回最新的单条），成功后就地更新内存；
    *   · 没有登录态 / 接口失败 → 抛出去让调用方提示，**不再偷偷写本地**
    *     （偷偷写本地会造成「看起来成功了，其实服务端没有」）。
    */
   const mutation = async <T>(run: () => Promise<T>): Promise<T> => {
      const result = await run();
      return result;
   };

   /** 增改之后把最新内容重新拉一遍，避免手工维护增量状态 */
   const refresh = async () => {
      const state = await loadFromServer();
      if (state) {
         apply(state);
         persistLocal(state);
         version.value = `server:${Date.now()}`;
      }
      return state;
   };

   /** 用 tRPC 客户端拉一次全量内容（SSR 与客户端都能用） */
   const loadFromServer = async (): Promise<LearningContentState | null> => {
      try {
         const { $trpc } = useNuxtApp();
         const state = await fetchLearningContent(
            $trpc as unknown as Parameters<typeof fetchLearningContent>[0],
         );
         return state;
      } catch (error) {
         console.warn('[learning] 内容加载失败，暂用本地缓存：', error);
         return null;
      }
   };

   /* ----- 文章 ----- */

   const addArticle = async (input: ArticleInput): Promise<LearningArticle> => {
      const { $trpc } = useNuxtApp();
      const created = await mutation(() =>
         $trpc.admin.learning.createArticle.mutate({
            title: input.title,
            slug: input.slug,
            summary: input.summary,
            source: input.body,
            coverPreset: input.coverPreset ?? 'slate',
            coverUrl: input.coverUrl || null,
         }),
      );
      await refresh();
      const article = articles.value.find(
         (item) => item.cuid === (created as { id: string }).id,
      );
      if (!article) throw new Error('文章已创建但读取失败');
      return article;
   };

   const editArticle = async (
      id: number,
      input: ArticleInput,
   ): Promise<LearningArticle | undefined> => {
      const current = articles.value.find((item) => item.id === id);
      if (!current?.cuid) return undefined;
      const { $trpc } = useNuxtApp();
      await mutation(() =>
         $trpc.admin.learning.updateArticle.mutate({
            id: current.cuid!,
            title: input.title,
            slug: input.slug,
            summary: input.summary,
            source: input.body,
            coverPreset: input.coverPreset ?? 'slate',
            coverUrl: input.coverUrl || null,
         }),
      );
      await refresh();
      return articles.value.find((item) => item.id === id);
   };

   /* ----- 专题 ----- */

   const addTopic = async (input: TopicInput): Promise<LearningTopic> => {
      const course = courses.value.find((item) => item.id === input.courseId);
      if (!course?.cuid) throw new Error('归属课程没有对应的服务端 id');
      const { $trpc } = useNuxtApp();
      const created = await mutation(() =>
         $trpc.admin.learning.createTopic.mutate({
            courseId: course.cuid!,
            name: input.name,
            slug: input.slug,
            description: input.description,
            weight: input.weight,
            coverPreset: input.coverPreset ?? 'slate',
            articleIds: articleCuids(input.articleIds),
            prerequisites: topicCuids(input.prerequisites),
         }),
      );
      await refresh();
      const topic = topics.value.find(
         (item) => item.cuid === (created as { id: string }).id,
      );
      if (!topic) throw new Error('专题已创建但读取失败');
      return topic;
   };

   const editTopic = async (
      id: number,
      input: TopicInput,
   ): Promise<LearningTopic | undefined> => {
      const current = topics.value.find((item) => item.id === id);
      if (!current?.cuid) return undefined;
      const course = courses.value.find((item) => item.id === input.courseId);
      if (!course?.cuid) throw new Error('归属课程没有对应的服务端 id');
      const { $trpc } = useNuxtApp();
      await mutation(() =>
         $trpc.admin.learning.updateTopic.mutate({
            id: current.cuid!,
            courseId: course.cuid!,
            name: input.name,
            slug: input.slug,
            description: input.description,
            weight: input.weight,
            coverPreset: input.coverPreset ?? 'slate',
            articleIds: articleCuids(input.articleIds),
            prerequisites: topicCuids(input.prerequisites),
         }),
      );
      await refresh();
      return topics.value.find((item) => item.id === id);
   };

   /* ----- 课程 ----- */

   const addCourse = async (
      input: CourseInput,
   ): Promise<LearningCourse> => {
      const { $trpc } = useNuxtApp();
      const created = await mutation(() =>
         $trpc.admin.learning.createCourse.mutate({
            name: input.name,
            slug: input.slug,
            description: input.description,
            weight: input.weight,
            coverPreset: input.coverPreset ?? 'slate',
            topicIds: topicCuids(input.topicIds),
         }),
      );
      await refresh();
      const course = courses.value.find(
         (item) => item.cuid === (created as { id: string }).id,
      );
      if (!course) throw new Error('课程已创建但读取失败');
      return course;
   };

   const editCourse = async (
      id: number,
      input: CourseInput,
   ): Promise<LearningCourse | undefined> => {
      const current = courses.value.find((item) => item.id === id);
      if (!current?.cuid) return undefined;
      const { $trpc } = useNuxtApp();
      await mutation(() =>
         $trpc.admin.learning.updateCourse.mutate({
            id: current.cuid!,
            name: input.name,
            slug: input.slug,
            description: input.description,
            weight: input.weight,
            coverPreset: input.coverPreset ?? 'slate',
            topicIds: topicCuids(input.topicIds),
         }),
      );
      await refresh();
      return courses.value.find((item) => item.id === id);
   };

   /* ----- 课程审核 ----- */

   const submitCourseForReview = async (id: number) => {
      const current = courses.value.find((item) => item.id === id);
      if (!current?.cuid) throw new Error('课程没有对应的服务端 id');
      const { $trpc } = useNuxtApp();
      await mutation(() =>
         $trpc.admin.learning.submitCourse.mutate({ id: current.cuid! }),
      );
      await refresh();
      return courses.value.find((item) => item.id === id);
   };

   const withdrawCourseReview = async (id: number) => {
      const current = courses.value.find((item) => item.id === id);
      if (!current?.cuid) throw new Error('课程没有对应的服务端 id');
      const { $trpc } = useNuxtApp();
      await mutation(() =>
         $trpc.admin.learning.withdrawCourse.mutate({ id: current.cuid! }),
      );
      await refresh();
      return courses.value.find((item) => item.id === id);
   };

   const reviewCourseSubmission = async (
      id: number,
      approve: boolean,
      reason?: string,
   ) => {
      const current = courses.value.find((item) => item.id === id);
      if (!current?.cuid) throw new Error('课程没有对应的服务端 id');
      const { $trpc } = useNuxtApp();
      await mutation(() =>
         $trpc.admin.learning.reviewCourse.mutate({
            id: current.cuid!,
            approve,
            reason: reason ?? null,
         }),
      );
      await refresh();
      return courses.value.find((item) => item.id === id);
   };

   /** 把数字 id 翻回服务端 cuid（写接口要的是 cuid） */
   const articleCuids = (ids: number[]) =>
      ids
         .map((id) => articles.value.find((item) => item.id === id)?.cuid)
         .filter((cuid): cuid is string => Boolean(cuid));

   const topicCuids = (ids: number[]) =>
      ids
         .map((id) => topics.value.find((item) => item.id === id)?.cuid)
         .filter((cuid): cuid is string => Boolean(cuid));

   /** 重新从服务端拉一遍（「恢复初始内容」与内容变更后都用它） */
   const resetToSeed = async () => {
      const state = await loadFromServer();
      if (state) {
         apply(state);
         persistLocal(state);
         version.value = `server:${Date.now()}`;
      }
      return state;
   };

   /**
    * 导出当前内容（课程 / 专题 / 文章）为 JSON。
    *
    * 内容只存在浏览器里，清一次站点数据就没了；给一个能自己留底的出口，
    * 比事后解释"为什么内容不见了"有用。
    */
   const exportContent = () => JSON.stringify(snapshot(), null, 2);

   return {
      articles,
      topics,
      courses,
      slice,
      exportContent,
      addArticle,
      editArticle,
      addTopic,
      editTopic,
      addCourse,
      editCourse,
      submitCourseForReview,
      withdrawCourseReview,
      reviewCourseSubmission,
      hydrateFromServer,
      loadFromServer,
      syncFromServer,
      refresh,
      resetToSeed,
   };
};
