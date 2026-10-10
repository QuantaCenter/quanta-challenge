/**
 * 学习系统的**派生规则与读取接口**。
 *
 * 层级（v0.5 起）：
 *   课程（HTML / CSS / JavaScript …）→ 专题（布局 / 变量 / 选择器 …）→ 文章（flex 布局 / grid 布局 …）→ 题目
 *
 * 三处关系里只有一处是「归属」（专题属于课程），另外两处都是「引用」：
 * 专题引用文章、文章引用题目 —— 被引用者独立存在，可以不被任何一方引用，也可以被多方引用。
 *
 * 内容本身（增删改）在 `use-learning-store.ts`，初始内容在 `learning-content.ts`；
 * 这里只放「事实 + 现算的派生值」：完成记录、进度、排序、按课程 / 专题取文章。
 */

import { unref, type Ref } from 'vue';
import { useLearningContentStore } from './use-learning-store';
import { renderArticleSource } from '~/utils/learning-markdown';
import { useLearningVisits } from '~/composables/use-learning-visits';
import {
   articleProgress,
   courseProgress,
   isArticleFinished,
   isProblemCompleted,
   topicProgress,
   emptyVisits,
   type CourseProgress,
   type VisitSlice,
} from '~/utils/learning-progress';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard';

/**
 * 读取内容时的数据切片。
 *
 * ⚠️ 为什么这些读函数**必须**能接收外部传入的内容，而不是各自去 `useState`：
 * `useState()` 只能在 setup / Nuxt 钩子里调用，而页面里大量用法是
 * `computed(() => courseTopics(id))` —— 在 computed getter 里再调 `useState`
 * 会直接抛「A composable that requires access to the Nuxt instance was called
 * outside of ... Vue setup function」。症状是整页 SSR 直接 500。
 *
 * 所以：setup 里可以只传 id（内部用 useLearningContentStore 取一次），
 * 页面里嵌套调用时把 `content.xxx` 传进来（Ref 与普通数组都吃）。
 */
export interface LearningContentSlice {
   articles?: Ref<LearningArticle[]> | LearningArticle[];
   topics?: Ref<LearningTopic[]> | LearningTopic[];
   courses?: Ref<LearningCourse[]> | LearningCourse[];
}

const list = <T>(value: Ref<T[]> | T[] | undefined, fallback: T[]): T[] =>
   value === undefined ? fallback : (unref(value) as T[]);

const resolveContent = (content?: LearningContentSlice): LearningContentSlice =>
   content ?? useLearningContentStore();

export interface LearningProblemRef {
   baseId: number;
   pid: number;
   title: string;
   difficulty: Difficulty;
   totalScore: number;
   // 引用已被删除：界面标注不可用，并按已完成计入进度
   unavailable?: boolean;
}

export type ContentBlock =
   | { type: 'heading'; text: string }
   | { type: 'paragraph'; text: string }
   | { type: 'list'; items: string[] }
   | { type: 'code'; lang: string; text: string }
   | { type: 'callout'; text: string };

/**
 * 封面。仓库里没有现成的配图素材，所以静态预览用一组固定的渐变预设，
 * 另外支持上传自定义图片（有 `coverUrl` 时优先）。
 * 类名必须是完整字面量，Tailwind 才能扫到。
 */
export type ArticleCoverPreset = 'aurora' | 'ember' | 'mint' | 'violet' | 'slate';

export interface ArticleCoverOption {
   id: ArticleCoverPreset;
   name: string;
   class: string;
}

export const ARTICLE_COVER_PRESETS: ArticleCoverOption[] = [
   {
      id: 'aurora',
      name: '极光',
      class: 'from-[#0b3d4f] via-[#12707f] to-[#1f9c6b]',
   },
   {
      id: 'ember',
      name: '余烬',
      class: 'from-[#4a2313] via-[#8a3d15] to-[#c96a1a]',
   },
   {
      id: 'mint',
      name: '薄荷',
      class: 'from-[#123a2a] via-[#1c5c3d] to-[#3f8b4a]',
   },
   {
      id: 'violet',
      name: '夜紫',
      class: 'from-[#2b1b4d] via-[#452a75] to-[#6b3fa0]',
   },
   {
      id: 'slate',
      name: '石墨',
      class: 'from-[#232323] via-[#333333] to-[#4a4a4a]',
   },
];

export const articleCoverClass = (
   preset?: ArticleCoverPreset | null,
): string =>
   ARTICLE_COVER_PRESETS.find((item) => item.id === preset)?.class ??
   ARTICLE_COVER_PRESETS[4]!.class;

// 文章是一等实体：独立存在、不归属任何专题，专题只是引用它
export interface LearningArticle {
   id: number;
   /** 服务端主键 */
   cuid?: string;
   slug: string;
   title: string;
   summary: string;
   content: ContentBlock[];
   problems: LearningProblemRef[];
   /**
    * 正文的 Markdown 源码（含 `<Problem baseId={…} />`）。
    * 它是真源；`content` 与 `problems` 都是从它解析出来的派生数据。
    * 保留源码的原因：编辑页要能原样打开——题目插在两段之间的位置不能丢，
    * 而从方块反推 Markdown 会把正文里的题目指令统一挪到末尾。
    */
   source?: string;
   coverPreset?: ArticleCoverPreset;
   // 上传的封面：有它就不看预设
   coverUrl?: string;
}

// 专题是一个知识领域的**文章引用集合**，归属一个课程
export interface LearningTopic {
   id: number;
   /** 服务端主键 */
   cuid?: string;
   courseId: number;
   slug: string;
   name: string;
   description: string;
   weight: number;
   // 只影响同一课程内的排列顺序，不做访问控制
   prerequisites: number[];
   // 引用，不是归属：同一篇文章可以出现在多个专题里，也可以一个都不出现
   articleIds: number[];
   coverPreset?: ArticleCoverPreset;
}

// 课程是一门可被完整学完的知识体系，是专题的集合
export interface LearningCourse {
   id: number;
   /** 服务端主键。前端 id 是数字（历史原因），写接口要的是这个 cuid */
   cuid?: string;
   slug: string;
   name: string;
   description: string;
   weight: number;
   status: 'draft' | 'pending' | 'published';
   coverPreset?: ArticleCoverPreset;
}

/**
 * 进度与完成度规则搬到了 `~/utils/learning-progress`（纯模块，可单测）。
 *
 * ⚠️ 必须**先 import 再 export**：`export { x } from '...'` 只对外转发，
 * 不会在本模块建立本地绑定。本文件内部的 `useRecentLearning` 等函数还要调用
 * 这些进度函数，用纯转发写法会得到 `topicProgress is not defined`
 * （页面整页 500，日志里就是这个错）。
 */
export {
   articleProgress,
   courseProgress,
   isArticleFinished,
   isProblemCompleted,
   topicProgress,
   emptyVisits,
   type ArticleProgress,
   type CourseProgress,
   type TopicProgress,
   type VisitSlice,
};


export function canPublishCourse(course: LearningCourse): boolean {
   return courseTopics(course.id).length > 0;
}

export function sortTopicsByPrecedence(
   topics: LearningTopic[],
): LearningTopic[] {
   const byId = new Map(topics.map((t) => [t.id, t]));
   const indegree = new Map<number, number>(topics.map((t) => [t.id, 0]));

   for (const topic of topics) {
      for (const pre of topic.prerequisites) {
         if (byId.has(pre)) {
            indegree.set(topic.id, (indegree.get(topic.id) ?? 0) + 1);
         }
      }
   }

   const compare = (a: LearningTopic, b: LearningTopic) =>
      a.weight - b.weight || a.id - b.id;

   const ready = topics
      .filter((t) => (indegree.get(t.id) ?? 0) === 0)
      .sort(compare);
   const sorted: LearningTopic[] = [];

   while (ready.length > 0) {
      const current = ready.shift()!;
      sorted.push(current);

      for (const topic of topics) {
         if (!topic.prerequisites.includes(current.id)) continue;
         const left = (indegree.get(topic.id) ?? 0) - 1;
         indegree.set(topic.id, left);
         if (left === 0) {
            ready.push(topic);
            ready.sort(compare);
         }
      }
   }

   if (sorted.length !== topics.length) {
      throw new Error('[learning] 专题先后关系里存在环，拓扑排序失败');
   }

   return sorted;
}

/* 对外的读取接口 */

/**
 * 学习侧只列**已上架**的课程：待审核 / 草稿是创作侧的状态，
 * 不应该出现在「全部课程」里（文章与专题不需要审核，所以没有对应的过滤）。
 */
export const isCoursePublished = (course: LearningCourse): boolean =>
   course.status === 'published';

/** 学习侧：只列已上架的课程（待审 / 草稿留在创作侧） */
export function useLearningCourses(
   content?: LearningContentSlice,
): LearningCourse[] {
   const courses = list(resolveContent(content).courses, []);
   return [...courses]
      .filter(isCoursePublished)
      .sort((a, b) => a.weight - b.weight || a.id - b.id);
}

/** 创作侧：全部课程，含待审与草稿 */
export function useAllCourses(
   content?: LearningContentSlice,
): LearningCourse[] {
   const courses = list(resolveContent(content).courses, []);
   return [...courses].sort((a, b) => a.weight - b.weight || a.id - b.id);
}

export function useLearningCourse(
   courseId: number | string,
   content?: LearningContentSlice,
): LearningCourse | undefined {
   const id = Number(courseId);
   return list(resolveContent(content).courses, []).find((c) => c.id === id);
}

export function courseTopics(
   courseId: number | string,
   content?: LearningContentSlice,
): LearningTopic[] {
   const id = Number(courseId);
   const topics = list(resolveContent(content).topics, []);
   return sortTopicsByPrecedence(topics.filter((t) => t.courseId === id));
}

/**
 * 学习侧的全部专题：按课程顺序平铺，课程内的顺序由先后关系决定。
 *
 * 只包含**已上架课程**下的专题：新建的课程是待审状态，
 * 它的专题在审核通过前不该出现在学习侧（文章与专题本身不需要审核）。
 * 创作侧要完整列表，用 `useAllTopics`。
 */
export function useLearningTopics(
   content?: LearningContentSlice,
): LearningTopic[] {
   return useLearningCourses(content).flatMap((course) =>
      courseTopics(course.id, content),
   );
}

/** 创作侧：全部专题，含待审 / 草稿课程下的 */
export function useAllTopics(content?: LearningContentSlice): LearningTopic[] {
   const topics = list(resolveContent(content).topics, []);
   return [...topics].sort((a, b) => a.weight - b.weight || a.id - b.id);
}

export function useLearningTopic(
   topicId: number | string,
   content?: LearningContentSlice,
): LearningTopic | undefined {
   const id = Number(topicId);
   return list(resolveContent(content).topics, []).find((t) => t.id === id);
}

export function useLearningArticles(
   content?: LearningContentSlice,
): LearningArticle[] {
   return list(resolveContent(content).articles, []);
}

export function useLearningArticle(
   articleId: number | string,
   content?: LearningContentSlice,
): LearningArticle | undefined {
   const id = Number(articleId);
   return list(resolveContent(content).articles, []).find((a) => a.id === id);
}

export function articlesOfTopic(
   topic: LearningTopic,
   content?: LearningContentSlice,
): LearningArticle[] {
   const articles = list(resolveContent(content).articles, []);
   return topic.articleIds
      .map((id) => articles.find((a) => a.id === id))
      .filter((a): a is LearningArticle => a !== undefined);
}

// 一个课程下的全部文章（按专题顺序平铺，同一篇只出现一次）
export function articlesOfCourse(
   courseId: number | string,
   content?: LearningContentSlice,
): LearningArticle[] {
   const seen = new Set<number>();
   const result: LearningArticle[] = [];
   for (const topic of courseTopics(courseId, content)) {
      for (const article of articlesOfTopic(topic, content)) {
         if (seen.has(article.id)) continue;
         seen.add(article.id);
         result.push(article);
      }
   }
   return result;
}

// 一篇文章被哪些专题引用：可能 0 个，也可能多个
export function topicsOfArticle(
   articleId: number | string,
   content?: LearningContentSlice,
): LearningTopic[] {
   const id = Number(articleId);
   return list(resolveContent(content).topics, []).filter((t) =>
      t.articleIds.includes(id),
   );
}

// 文章页的地址必须带一个专题上下文，所以取第一个引用它的专题
export function firstTopicOfArticle(
   articleId: number | string,
   content?: LearningContentSlice,
): LearningTopic | undefined {
   return topicsOfArticle(articleId, content)[0];
}

/* 学习首页 / 课程总览用的读取接口 */

// 在学课程：有访问记录的课程，按最近打开时间倒序
export function useLearningActiveCourses(
   content?: LearningContentSlice,
   visits: VisitSlice = emptyVisits(),
): {
   course: LearningCourse;
   progress: CourseProgress;
}[] {
   return useLearningCourses(content)
      .map((course) => ({
         course,
         progress: courseProgress(
            course,
            visits,
            courseTopics(course.id, content),
            articlesOfCourse(course.id, content),
         ),
      }))
      .filter((row) => row.progress.lastOpenedAt !== null)
      .sort((a, b) =>
         (b.progress.lastOpenedAt ?? '') < (a.progress.lastOpenedAt ?? '')
            ? -1
            : 1,
      );
}

// 推荐课程：一次都没打开过的课程
export function useLearningRecommendedCourses(
   content?: LearningContentSlice,
   visits: VisitSlice = emptyVisits(),
): LearningCourse[] {
   return useLearningCourses(content).filter(
      (course) =>
         courseProgress(
            course,
            visits,
            courseTopics(course.id, content),
            articlesOfCourse(course.id, content),
         ).lastOpenedAt === null,
   );
}

export function useLearningTopicArticle(
   topicId: number | string,
   articleId: number | string,
   content?: LearningContentSlice,
):
   | { topic: LearningTopic; course?: LearningCourse; article: LearningArticle }
   | undefined {
   const topic = useLearningTopic(topicId, content);
   if (!topic) return undefined;
   const article = articlesOfTopic(topic, content).find(
      (a) => a.id === Number(articleId),
   );
   if (!article) return undefined;
   return {
      topic,
      course: useLearningCourse(topic.courseId, content),
      article,
   };
}

export function useRecentLearning(
   limit = 3,
   content?: LearningContentSlice,
   visits: VisitSlice = emptyVisits(),
): RecentLearningItem[] {
   return useLearningTopics(content)
      .map((topic) => {
         const course = useLearningCourse(topic.courseId, content);
         return {
            ...topicProgress(topic, visits, articlesOfTopic(topic, content)),
            courseId: topic.courseId,
            courseName: course?.name ?? '',
            topicId: topic.id,
            topicName: topic.name,
         };
      })
      .filter((item) => item.lastOpenedAt !== null)
      .sort((a, b) => (b.lastOpenedAt! < a.lastOpenedAt! ? -1 : 1))
      .slice(0, limit);
}

/* 创作侧（发布页）的读取接口 */

/* ---------- 题库（文章正文只能引用真题库里已发布的题） ---------- */

/** `public.problem.listPublicProblems` 返回的一条（只列这里用到的字段） */
interface ApiProblem {
   baseId?: number;
   pid: number;
   title: string;
   difficulty: Difficulty;
   totalScore: number;
   tags?: Array<{ name: string; color: string }>;
}

const API_PAGE_SIZE = 48;

/** 翻页拉全部已发布题目，按 baseId 去重排序（一次会话只拉一遍） */
const fetchPublishedProblems = async (): Promise<LearningProblemRef[]> => {
   const { $trpc } = useNuxtApp();
   const collected = new Map<number, LearningProblemRef>();
   let cursor: number | null | undefined;

   // 游标分页，最多翻 20 页（48 × 20 = 960 道题，够用且不会失控）
   for (let page = 0; page < 20; page += 1) {
      const result = await $trpc.public.problem.listPublicProblems.query({
         limit: API_PAGE_SIZE,
         ...(cursor == null ? {} : { cursor }),
      });
      for (const item of (result.items ?? []) as ApiProblem[]) {
         // 没有 baseId 的题没法写进正文：宁可不出现，也不要插入后变成未知题目
         if (typeof item.baseId !== 'number') continue;
         if (collected.has(item.baseId)) continue;
         collected.set(item.baseId, {
            baseId: item.baseId,
            pid: item.pid,
            title: item.title,
            difficulty: item.difficulty,
            totalScore: item.totalScore,
         });
      }
      cursor = result.nextCursor ?? null;
      if (cursor == null) break;
   }

   return [...collected.values()].sort((a, b) => a.baseId - b.baseId);
};

/**
 * 题库的全部状态与操作。
 *
 * ⚠️ 必须在 setup 里调一次（它会 `useState`），拿到的 `reload` 才可以
 * 在事件回调 / watch 里随便调 —— 那里已经没有 Nuxt 上下文了。
 */
const useProblemBankState = () => {
   const bank = useState<LearningProblemRef[]>(
      'learning-problem-bank',
      () => [],
   );
   const loaded = useState<boolean>('learning-problem-bank-loaded', () => false);
   const loading = useState<boolean>('learning-problem-bank-loading', () => false);
   const failed = useState<boolean>('learning-problem-bank-failed', () => false);

   const load = async (force = false) => {
      if (loading.value) return;
      if (loaded.value && !force) return;
      loading.value = true;
      failed.value = false;
      try {
         bank.value = await fetchPublishedProblems();
         loaded.value = true;
      } catch (error) {
         failed.value = true;
         console.warn('[learning] 题库加载失败：', error);
      } finally {
         loading.value = false;
      }
   };

   return { bank, loaded, loading, failed, load };
};

/**
 * 已发布题目的题库，供文章正文插入 `<Problem baseId={…} />`。
 *
 * 历史实现是**从已有文章的引用里反推**题库，那是个循环依赖：
 * 文章不引用某道题 → 它就进不了题库 → 也就没法被引用。
 * 症状正是「刚发布的题在选题列表里搜不到」。
 *
 * 现在直接问服务端要已发布的题，一次会话只拉一遍；没有登录态时静默失败，
 * 只是题库为空，不影响其它功能。
 */
export function useLearningProblemBank(
   content?: LearningContentSlice,
): LearningProblemRef[] {
   const { bank, load } = useProblemBankState();

   // SSR 首帧不发这个请求（会带上服务端上下文），挂载后再拉
   if (import.meta.client) onMounted(() => void load());

   if (bank.value.length > 0) return bank.value;

   // 接口没回来 / 失败时，先用文章里已有的引用兜底显示
   const articles = list(resolveContent(content).articles, []);
   const byBaseId = new Map<number, LearningProblemRef>();
   for (const article of articles) {
      for (const problem of article.problems) {
         if (problem.unavailable) continue;
         if (!byBaseId.has(problem.baseId)) byBaseId.set(problem.baseId, problem);
      }
   }
   return [...byBaseId.values()].sort((a, b) => a.baseId - b.baseId);
}

/**
 * 题库的状态与手动刷新，给选题浮窗用。
 *
 * `reload()` 会强制重拉一次并更新上面那个共享状态，用于：
 *   · 上一次拉失败了（没登录 / 网络问题）；
 *   · 刚发布了一道新题，想让选题浮窗立刻看到它。
 */
export function useLearningProblemBankStatus() {
   const { loaded, loading, failed, load } = useProblemBankState();

   return {
      loading,
      failed,
      loaded,
      reload: () => load(true),
   };
}

// 把文章正文还原成 Markdown 源码，供发布页的编辑表单打开已有文章。
// 正文是「引用了哪些题」的唯一来源：优先用存下来的源码（位置不丢），
// 只有老数据没存源码时才从方块反推。
export const articleMarkdown = (article: LearningArticle): string =>
   article.source ?? renderArticleSource(article);

/* 正文的两种表示（Markdown ↔ 方块）在 `~/utils/learning-markdown.ts`，
   内容的增删改在 `./use-learning-store.ts`：它们各自被 Nuxt 自动导入，
   这里不再转发，避免同名的重复导出。 */
