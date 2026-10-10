import {
   SEED_ARTICLES,
   SEED_COURSES,
   SEED_TOPICS,
   seedArticleId,
   seedCourseId,
   seedTopicId,
} from '~/composables/learning-content';
import type {
   LearningArticle,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';
import { parseArticleBody } from '~/utils/learning-markdown';

/**
 * 学习内容（课程 / 专题 / 文章）的**纯操作**：没有 Vue、没有 localStorage。
 *
 * 分成两层的理由：这一层可以在 Node 里直接测（`learning-content-ops.spec.ts`），
 * 而「状态 + 持久化」那一层（`use-learning-store.ts`）只剩接线。
 * 内容错了、引用断了、id 撞了，测试里第一时间就能看见，不必等到浏览器里点。
 */

export interface LearningContentState {
   articles: LearningArticle[];
   topics: LearningTopic[];
   courses: LearningCourse[];
}

export interface ArticleInput {
   title: string;
   slug: string;
   summary: string;
   body: string;
   coverPreset?: LearningArticle['coverPreset'];
   coverUrl?: string;
}

export interface TopicInput {
   name: string;
   slug: string;
   description: string;
   weight: number;
   courseId: number;
   prerequisites: number[];
   articleIds: number[];
   coverPreset?: LearningTopic['coverPreset'];
}

export interface CourseInput {
   name: string;
   slug: string;
   description: string;
   weight: number;
   topicIds: number[];
   status?: LearningCourse['status'];
   coverPreset?: LearningCourse['coverPreset'];
}

/* ---------- 初始内容 ---------- */

const slugToArticleId = new Map(
   SEED_ARTICLES.map((article, index) => [article.slug, seedArticleId(index)]),
);
const slugToTopicId = new Map(
   SEED_TOPICS.map((topic, index) => [topic.slug, seedTopicId(index)]),
);
const slugToCourseId = new Map(
   SEED_COURSES.map((course, index) => [course.slug, seedCourseId(index)]),
);

export const buildSeedArticles = (): LearningArticle[] =>
   SEED_ARTICLES.map((article, index) => {
      const { blocks, problems } = parseArticleBody(article.body);
      return {
         id: seedArticleId(index),
         slug: article.slug,
         title: article.title,
         summary: article.summary,
         content: blocks,
         problems,
         source: article.body,
         coverPreset: article.coverPreset,
      };
   });

export const buildSeedTopics = (): LearningTopic[] =>
   SEED_TOPICS.map((topic, index) => ({
      id: seedTopicId(index),
      courseId: slugToCourseId.get(topic.courseSlug) ?? 0,
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      weight: topic.weight,
      prerequisites: topic.prerequisites
         .map((slug) => slugToTopicId.get(slug))
         .filter((id): id is number => id !== undefined),
      articleIds: topic.articleSlugs
         .map((slug) => slugToArticleId.get(slug))
         .filter((id): id is number => id !== undefined),
      coverPreset: topic.coverPreset,
   }));

export const buildSeedCourses = (): LearningCourse[] =>
   SEED_COURSES.map((course, index) => ({
      id: seedCourseId(index),
      slug: course.slug,
      name: course.name,
      description: course.description,
      weight: course.weight,
      status: 'published',
      coverPreset: course.coverPreset,
   }));

/** 每次调用都返回全新的对象（避免调用方改动污染「初始内容」） */
export const createSeedContent = (): LearningContentState => ({
   articles: buildSeedArticles(),
   topics: buildSeedTopics(),
   courses: buildSeedCourses(),
});

/** 深拷贝一层：方块、引用数组都要断开，否则「恢复初始内容」会恢复不了 */
export const cloneContent = (
   state: LearningContentState,
): LearningContentState => ({
   articles: state.articles.map((article) => ({
      ...article,
      content: article.content.map((block) => ({ ...block })),
      problems: article.problems.map((problem) => ({ ...problem })),
   })),
   topics: state.topics.map((topic) => ({
      ...topic,
      prerequisites: [...topic.prerequisites],
      articleIds: [...topic.articleIds],
   })),
   courses: state.courses.map((course) => ({ ...course })),
});

/* ---------- id 分配 ---------- */

/**
 * 新 id = 当前列表里的最大 id + 1。
 *
 * ⚠️ 不能写成 `SEED_ID_BASE` 兜底：初始文章 id 是 101…120，
 * 用 100 兜底会让「第一篇新文章」直接拿到 101，与初始文章**撞号**——
 * 表现是发布成功的文章在列表里看不见（被同 id 的另一篇顶掉）、
 * 或者按 id 打开时打开的是别人。
 */
export const nextId = (list: { id: number }[]): number =>
   list.reduce((max, item) => Math.max(max, item.id), 0) + 1;

const nowSlug = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

/* ---------- 文章 ---------- */

export const createArticle = (
   state: LearningContentState,
   input: ArticleInput,
): LearningContentState => {
   const { blocks, problems } = parseArticleBody(input.body);
   const article: LearningArticle = {
      id: nextId(state.articles),
      slug: input.slug.trim() || nowSlug('article'),
      title: input.title.trim(),
      summary: input.summary.trim(),
      content: blocks,
      problems,
      source: input.body,
      coverPreset: input.coverPreset ?? 'slate',
      ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
   };
   return { ...state, articles: [...state.articles, article] };
};

export const updateArticle = (
   state: LearningContentState,
   id: number,
   input: ArticleInput,
): LearningContentState => {
   const current = state.articles.find((article) => article.id === id);
   if (!current) return state;

   const { blocks, problems } = parseArticleBody(input.body);
   const next: LearningArticle = {
      ...current,
      slug: input.slug.trim() || current.slug,
      title: input.title.trim(),
      summary: input.summary.trim(),
      content: blocks,
      problems,
      source: input.body,
      coverPreset: input.coverPreset ?? current.coverPreset,
   };
   if (input.coverUrl) next.coverUrl = input.coverUrl;
   else delete next.coverUrl;

   return {
      ...state,
      articles: state.articles.map((article) =>
         article.id === id ? next : article,
      ),
   };
};

/* ---------- 专题 ---------- */

export const createTopic = (
   state: LearningContentState,
   input: TopicInput,
): LearningContentState => {
   const topic: LearningTopic = {
      id: nextId(state.topics),
      courseId: input.courseId,
      slug: input.slug.trim() || nowSlug('topic'),
      name: input.name.trim(),
      description: input.description.trim(),
      weight: input.weight,
      prerequisites: [...input.prerequisites],
      articleIds: [...input.articleIds],
      coverPreset: input.coverPreset ?? 'slate',
   };
   return { ...state, topics: [...state.topics, topic] };
};

export const updateTopic = (
   state: LearningContentState,
   id: number,
   input: TopicInput,
): LearningContentState => {
   const current = state.topics.find((topic) => topic.id === id);
   if (!current) return state;

   const next: LearningTopic = {
      ...current,
      courseId: input.courseId,
      slug: input.slug.trim() || current.slug,
      name: input.name.trim(),
      description: input.description.trim(),
      weight: input.weight,
      prerequisites: [...input.prerequisites],
      articleIds: [...input.articleIds],
      coverPreset: input.coverPreset ?? current.coverPreset,
   };
   return {
      ...state,
      topics: state.topics.map((topic) => (topic.id === id ? next : topic)),
   };
};

/* ---------- 课程 ---------- */

/** 课程编排专题是**归属**：被编排进来的专题 courseId 要跟着改 */
const assignTopicsToCourse = (
   topics: LearningTopic[],
   courseId: number,
   topicIds: number[],
): LearningTopic[] =>
   topicIds.length === 0
      ? topics
      : topics.map((topic) =>
           topicIds.includes(topic.id) ? { ...topic, courseId } : topic,
        );

export const createCourse = (
   state: LearningContentState,
   input: CourseInput,
): LearningContentState => {
   const id = nextId(state.courses);
   const course: LearningCourse = {
      id,
      slug: input.slug.trim() || nowSlug('course'),
      name: input.name.trim(),
      description: input.description.trim(),
      weight: input.weight,
      // 课程是唯一需要审核的实体：默认进待审，而不是直接上架
      status: input.status ?? 'pending',
      coverPreset: input.coverPreset ?? 'slate',
   };
   return {
      articles: state.articles,
      topics: assignTopicsToCourse(state.topics, id, input.topicIds),
      courses: [...state.courses, course],
   };
};

export const updateCourse = (
   state: LearningContentState,
   id: number,
   input: CourseInput,
): LearningContentState => {
   const current = state.courses.find((course) => course.id === id);
   if (!current) return state;

   const next: LearningCourse = {
      ...current,
      slug: input.slug.trim() || current.slug,
      name: input.name.trim(),
      description: input.description.trim(),
      weight: input.weight,
      status: input.status ?? current.status,
      coverPreset: input.coverPreset ?? current.coverPreset,
   };
   return {
      articles: state.articles,
      topics: assignTopicsToCourse(state.topics, id, input.topicIds),
      courses: state.courses.map((course) => (course.id === id ? next : course)),
   };
};

/* ---------- 引用完整性 ---------- */

/**
 * 过滤掉指向不存在文章的引用。
 *
 * localStorage 里的快照可能来自旧版本（例如初始文章 id 方案变过），
 * 不清理的话专题页会出现「点不开的文章」。
 */
export const pruneDanglingRefs = (
   state: LearningContentState,
): LearningContentState => {
   // id 撞号的内容必须丢掉重的那份：老版本（nextId 从 100 兜底）会产出与初始
   // 文章同号的记录，按 id 查找永远只会命中一个，另一篇等于不存在。
   const articles = dedupeById(state.articles);
   const topics = dedupeById(state.topics);
   const courses = dedupeById(state.courses);

   const articleIds = new Set(articles.map((article) => article.id));
   const topicIds = new Set(topics.map((topic) => topic.id));
   return {
      articles,
      courses,
      topics: topics.map((topic) => ({
         ...topic,
         articleIds: topic.articleIds.filter((id) => articleIds.has(id)),
         prerequisites: topic.prerequisites.filter((id) => topicIds.has(id)),
      })),
   };
};

/** 同 id 只留第一条（先出现的通常是种子内容） */
const dedupeById = <T extends { id: number }>(items: T[]): T[] => {
   const seen = new Set<number>();
   return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
   });
};
