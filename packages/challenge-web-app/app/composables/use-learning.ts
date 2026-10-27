/**
 * 学习系统的派生规则与读取接口。
 */

import { unref, type Ref } from 'vue';
import { useLearningContentStore } from './use-learning-store';
import { renderArticleSource } from '~/utils/learning-markdown';
import { useLearningVisits } from '~/composables/use-learning-visits';
import {
   courseProgress,
   topicProgress,
   emptyVisits,
   type CourseProgress,
   type VisitSlice,
} from '~/utils/learning-progress';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard';

/**
 * 数据切片：读函数默认取 store，嵌套调用时可从外部传入。
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
   /** 题目封面，空则用占位图 */
   imageName?: string | null;
   imageHash?: string | null;
   imageThumbhashUrl?: string | null;
   /** 题目标签 */
   tags?: Array<{ name: string; color: string | null }>;
}

export type ContentBlock =
   | { type: 'heading'; text: string }
   | { type: 'paragraph'; text: string }
   | { type: 'list'; items: string[] }
   | { type: 'code'; lang: string; text: string }
   | { type: 'callout'; text: string };

/**
 * 封面渐变预设，类名必须是完整字面量供 Tailwind 扫描。
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

// 文章独立存在，专题只引用它
export interface LearningArticle {
   id: number;
   /** 服务端主键 */
   cuid?: string;
   title: string;
   summary: string;
   /** 发布时间 */
   createdAt?: string;
   /** 发布人显示名 */
   authorName?: string;
   /** 发布人头像 URL */
   authorAvatarUrl?: string | null;
   content: ContentBlock[];
   problems: LearningProblemRef[];
   /** 正文 Markdown 源码，是真源；content 与 problems 由它解析 */
   source?: string;
   coverPreset?: ArticleCoverPreset;
   // 上传的封面，优先于预设
   coverUrl?: string;
}

// 专题归属一个课程，引用一组文章
export interface LearningTopic {
   id: number;
   /** 服务端主键 */
   cuid?: string;
   courseId: number;
   name: string;
   description: string;
   // 引用而非归属
   articleIds: number[];
   coverPreset?: ArticleCoverPreset;
}

// 课程是专题的集合
export interface LearningCourse {
   id: number;
   /** 服务端主键，写接口使用 */
   cuid?: string;
   name: string;
   description: string;
   status: 'draft' | 'pending' | 'published';
   coverPreset?: ArticleCoverPreset;
   /** 编排的专题顺序，存在课程上 */
   topicIds: number[];
}

export function canPublishCourse(course: LearningCourse): boolean {
   return courseTopics(course.id).length > 0;
}

/* 对外的读取接口 */

export const isCoursePublished = (course: LearningCourse): boolean =>
   course.status === 'published';

/** 学习侧：只列已上架课程，按创建时间排序 */
export function useLearningCourses(
   content?: LearningContentSlice,
): LearningCourse[] {
   const courses = list(resolveContent(content).courses, []);
   return [...courses].filter(isCoursePublished);
}

/** 创作侧：全部课程，按创建时间排序 */
export function useAllCourses(
   content?: LearningContentSlice,
): LearningCourse[] {
   return [...list(resolveContent(content).courses, [])];
}

export function useLearningCourse(
   courseId: number | string,
   content?: LearningContentSlice,
): LearningCourse | undefined {
   const id = Number(courseId);
   return list(resolveContent(content).courses, []).find((c) => c.id === id);
}

/** 课程下的专题，按课程编排的 topicIds 排序 */
export function courseTopics(
   courseId: number | string,
   content?: LearningContentSlice,
): LearningTopic[] {
   const slice = resolveContent(content);
   const id = Number(courseId);
   const mine = list(slice.topics, []).filter((t) => t.courseId === id);
   const order = list(slice.courses, []).find((c) => c.id === id)?.topicIds;
   if (!order || order.length === 0) {
      return [...mine].sort((a, b) => a.id - b.id);
   }
   const indexOf = new Map(order.map((topicId, index) => [topicId, index]));
   return [...mine].sort(
      (a, b) =>
         (indexOf.get(a.id) ?? order.length) -
            (indexOf.get(b.id) ?? order.length) ||
         a.id - b.id,
   );
}

/** 学习侧的全部专题，按课程顺序平铺 */
export function useLearningTopics(
   content?: LearningContentSlice,
): LearningTopic[] {
   return useLearningCourses(content).flatMap((course) =>
      courseTopics(course.id, content),
   );
}

/** 创作侧：全部专题，按归属课程排序 */
export function useAllTopics(content?: LearningContentSlice): LearningTopic[] {
   const topics = list(resolveContent(content).topics, []);
   return [...topics].sort((a, b) => a.courseId - b.courseId || a.id - b.id);
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

// 课程下的全部文章，按专题顺序去重平铺
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

// 文章被哪些专题引用
export function topicsOfArticle(
   articleId: number | string,
   content?: LearningContentSlice,
): LearningTopic[] {
   const id = Number(articleId);
   return list(resolveContent(content).topics, []).filter((t) =>
      t.articleIds.includes(id),
   );
}

// 文章页地址需要专题上下文，取第一个引用它的专题
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

/* 题库：正文只能引用已发布的题 */

/** listPublicProblems 返回的一条，只列用到的字段 */
interface ApiProblem {
   baseId?: number;
   pid: number;
   title: string;
   difficulty: Difficulty;
   totalScore: number;
   imageName?: string | null;
   imageHash?: string | null;
   imageThumbhashUrl?: string | null;
   tags?: Array<{ name: string; color: string }>;
}

const API_PAGE_SIZE = 48;

/** 翻页拉全部已发布题目，按 baseId 去重 */
const fetchPublishedProblems = async (): Promise<LearningProblemRef[]> => {
   const { $trpc } = useNuxtApp();
   const collected = new Map<number, LearningProblemRef>();
   let cursor: number | null | undefined;

   // 游标分页，最多翻 20 页
   for (let page = 0; page < 20; page += 1) {
      const result = await $trpc.public.problem.listPublicProblems.query({
         limit: API_PAGE_SIZE,
         ...(cursor == null ? {} : { cursor }),
      });
      for (const item of (result.items ?? []) as ApiProblem[]) {
         // 没有 baseId 的题无法写进正文，跳过
         if (typeof item.baseId !== 'number') continue;
         if (collected.has(item.baseId)) continue;
         collected.set(item.baseId, {
            baseId: item.baseId,
            pid: item.pid,
            title: item.title,
            difficulty: item.difficulty,
            totalScore: item.totalScore,
            imageName: item.imageName ?? null,
            imageHash: item.imageHash ?? null,
            imageThumbhashUrl: item.imageThumbhashUrl ?? null,
            tags: item.tags ?? [],
         });
      }
      cursor = result.nextCursor ?? null;
      if (cursor == null) break;
   }

   return [...collected.values()].sort((a, b) => a.baseId - b.baseId);
};

/** 题库共享状态，必须在 setup 里调用一次 */
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

/** 已发布题目的题库，供正文插入题目引用；未登录时静默失败 */
export function useLearningProblemBank(
   content?: LearningContentSlice,
): LearningProblemRef[] {
   const { bank, load } = useProblemBankState();

   // 挂载后再拉，SSR 首帧不发请求
   if (import.meta.client) onMounted(() => void load());

   if (bank.value.length > 0) return bank.value;

   // 接口未就绪时，用文章已有引用兜底
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

/** 题库状态与手动刷新，给选题浮窗用 */
export function useLearningProblemBankStatus() {
   const { loaded, loading, failed, load } = useProblemBankState();

   return {
      loading,
      failed,
      loaded,
      reload: () => load(true),
   };
}

/** 文章正文还原为 Markdown 源码，优先用存下的源码 */
export const articleMarkdown = (article: LearningArticle): string =>
   article.source ?? renderArticleSource(article);
