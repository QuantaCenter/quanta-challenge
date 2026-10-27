/**
 * 进度与完成度的纯规则。
 */

import type {
   LearningArticle,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';
import { isDoneForever } from '~/utils/learning-visits';

/** 从一批文章里挑出专题引用的那些，顺序跟 articleIds 一致 */
const articlesOfTopicFrom = (
   topic: LearningTopic,
   articles: LearningArticle[],
): LearningArticle[] =>
   topic.articleIds
      .map((id) => articles.find((article) => article.id === id))
      .filter((article): article is LearningArticle => article !== undefined);

export interface ArticleProgress {
   total: number;
   done: number;
   progress: number;
   percent: number;
   completed: boolean;
   isReadingOnly: boolean;
   read: boolean;
   lastOpenedAt: string | null;
}

export interface TopicProgress {
   articleCount: number;
   finishedArticles: number;
   problemCount: number;
   doneProblems: number;
   percent: number;
   completed: boolean;
   /** 纯阅读专题用已读表达完成 */
   isReadingOnly: boolean;
   read: boolean;
   lastOpenedAt: string | null;
}

export interface CourseProgress {
   topicCount: number;
   finishedTopics: number;
   articleCount: number;
   finishedArticles: number;
   problemCount: number;
   doneProblems: number;
   percent: number;
   // 单向：一旦完成就不再回退
   completed: boolean;
   /** 纯阅读课程用已读表达完成 */
   isReadingOnly: boolean;
   read: boolean;
   completedAt: string | null;
   lastOpenedAt: string | null;
}

// 「最近学习」卡片的一行 = 一个专题，连同它所属的课程名
export interface RecentLearningItem extends TopicProgress {
   courseId: number;
   courseName: string;
   topicId: number;
   topicName: string;
}

/* 事实（Facts）。其余全部现算。 */

/** 这道题是否做过，读真实做题记录 */
const isSolved = (baseId: number, visits: VisitSlice): boolean =>
   Boolean(visits.solved?.[String(baseId)]);

/** 访问记录切片，须在 setup 里取好后显式传入 */
export interface VisitSlice {
   articles: Record<string, { cuid: string; at: string }>;
   topics: Record<string, { cuid: string; at: string }>;
   /** 做过的题，键是 baseId */
   solved?: Record<string, string>;
   /** 已完成的专题与文章，键是 cuid */
   done?: Record<string, string>;
}

export const emptyVisits = (): VisitSlice => ({ articles: {}, topics: {} });

/* 规则 */

export function articleProgress(
   article: LearningArticle,
   visits: VisitSlice = emptyVisits(),
): ArticleProgress {
   const total = article.problems.length;
   const done = article.problems.filter(
      // 已下架的题计入已完成
      (p) => p.unavailable || isSolved(p.baseId, visits),
   ).length;
   const isReadingOnly = total === 0;
   // 完成状态不可逆，一旦标记完成就保持 100%
   const doneForever = isDoneForever(visits.done ?? {}, article.cuid);
   const progress = isReadingOnly ? 0 : doneForever ? 1 : done / total;
   const lastOpenedAt = article.cuid
      ? (visits.articles[article.cuid]?.at ?? null)
      : null;

   return {
      total,
      done,
      progress,
      // 向下取整：99.5% 显示 99%，避免「显示 100% 却拿不到对勾」
      percent: Math.floor(progress * 100),
      completed: !isReadingOnly && progress === 1,
      isReadingOnly,
      read: lastOpenedAt !== null,
      lastOpenedAt,
   };
}

/** 这道题是否做过，不传记录时视为未做 */
export function isProblemCompleted(
   baseId: number,
   visits: VisitSlice = emptyVisits(),
): boolean {
   return isSolved(baseId, visits);
}

// 一篇文章是否算学完：有题目的要全做对，纯阅读的打开即算
export const isArticleFinished = (
   article: LearningArticle,
   visits: VisitSlice = emptyVisits(),
): boolean => {
   const state = articleProgress(article, visits);
   return state.completed || (state.isReadingOnly && state.read);
};

const latest = (values: (string | null)[]): string | null =>
   values.reduce<string | null>(
      (acc, value) => (value && (!acc || value > acc) ? value : acc),
      null,
   );

export function topicProgress(
   topic: LearningTopic,
   visits: VisitSlice = emptyVisits(),
   /** 专题下的文章，由调用方解析好传入 */
   articles: LearningArticle[] = [],
): TopicProgress {
   const states = articles.map((article) => articleProgress(article, visits));
   const problemCount = states.reduce((sum, s) => sum + s.total, 0);
   const doneProblems = states.reduce((sum, s) => sum + s.done, 0);
   const finishedArticles = articles.filter((article) =>
      isArticleFinished(article, visits),
   ).length;
   const lastOpenedAt = latest([
      ...states.map((s) => s.lastOpenedAt),
      topic.cuid ? (visits.topics[topic.cuid]?.at ?? null) : null,
   ]);

   // 完成 = 有题目且全部做完，不可逆
   const doneForever = isDoneForever(visits.done ?? {}, topic.cuid);
   const completed =
      doneForever ||
      (articles.length > 0 && problemCount > 0 && doneProblems === problemCount);
   const isReadingOnly = articles.length > 0 && problemCount === 0;
   // 已读 = 每一篇都读过
   const read = isReadingOnly && states.every((state) => state.read);

   return {
      articleCount: articles.length,
      finishedArticles,
      problemCount,
      doneProblems: completed && problemCount > 0 ? problemCount : doneProblems,
      percent:
         problemCount === 0
            ? 0
            : completed
              ? 100
              : Math.floor((doneProblems / problemCount) * 100),
      completed,
      isReadingOnly,
      read,
      lastOpenedAt,
   };
}

export function courseProgress(
   course: LearningCourse,
   visits: VisitSlice = emptyVisits(),
   /** 课程下的专题与文章，由调用方解析好传入 */
   topics: LearningTopic[] = [],
   courseArticles: LearningArticle[] = [],
): CourseProgress {
   const articles = courseArticles;
   const topicStates = topics.map((topic) =>
      topicProgress(topic, visits, articlesOfTopicFrom(topic, courseArticles)),
   );
   const problemCount = topicStates.reduce((sum, s) => sum + s.problemCount, 0);
   const doneProblems = topicStates.reduce((sum, s) => sum + s.doneProblems, 0);
   // 完成时间暂无落库，由进度推导
   const completedAt: string | null = null;
   const doneForever = isDoneForever(visits.done ?? {}, course.cuid);

   return {
      topicCount: topics.length,
      finishedTopics: topicStates.filter((s) => s.completed).length,
      articleCount: articles.length,
      finishedArticles: articles.filter((article) =>
         isArticleFinished(article, visits),
      ).length,
      problemCount,
      doneProblems,
      percent:
         problemCount === 0
            ? 0
            : Math.floor((doneProblems / problemCount) * 100),
      // 不可逆：一旦完成就永远是完成
      completed:
         doneForever ||
         (completedAt !== null && problemCount === 0) ||
         (topics.length > 0 &&
            problemCount > 0 &&
            doneProblems === problemCount),
      isReadingOnly: topics.length > 0 && problemCount === 0,
      // 已读要求全部专题都已读
      read:
         problemCount === 0 &&
         topicStates.length > 0 &&
         topicStates.every((state) => state.read),
      completedAt,
      lastOpenedAt: latest(topicStates.map((s) => s.lastOpenedAt)),
   };
}

// 发布校验：0 专题的课程可以存草稿，但不能发布
