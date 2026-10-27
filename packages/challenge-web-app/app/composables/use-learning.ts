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

/** 学习内容全量状态：store 与数据层共用的形状 */
export interface LearningContentState {
   articles: LearningArticle[];
   topics: LearningTopic[];
   courses: LearningCourse[];
}

/** 写接口的表单输入 */
export interface ArticleInput {
   title: string;
   summary: string;
   body: string;
   coverPreset?: LearningArticle['coverPreset'];
   coverUrl?: string;
}

export interface TopicInput {
   name: string;
   description: string;
   courseId: number;
   articleIds: number[];
   coverPreset?: LearningTopic['coverPreset'];
}

export interface CourseInput {
   name: string;
   description: string;
   topicIds: number[];
   status?: LearningCourse['status'];
   coverPreset?: LearningCourse['coverPreset'];
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

/** 文章正文还原为 Markdown 源码，优先用存下的源码 */
export const articleMarkdown = (article: LearningArticle): string =>
   article.source ?? renderArticleSource(article);
