import { useAsyncData, useState } from '#imports';
import type {
   LearningArticle,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';
import type {
   ArticleInput,
   CourseInput,
   LearningContentState,
   TopicInput,
} from '~/utils/learning-content-ops';
import { fetchLearningContent } from '~/utils/learning-content-source';

/** 学习内容的状态层：服务端是真源，一次全量拉取后住进全局状态 */

export const useLearningContentStore = () => {
   /** 用 tRPC 客户端拉一次全量内容（SSR 与客户端都能用） */
   const loadFromServer = async (): Promise<LearningContentState | null> => {
      try {
         const { $trpc } = useNuxtApp();
         const state = await fetchLearningContent(
            $trpc as unknown as Parameters<typeof fetchLearningContent>[0],
         );
         return state;
      } catch (error) {
         console.warn('[learning] 内容加载失败：', error);
         return null;
      }
   };

   /** 全量内容一次拉取：SSR 在渲染前完成并随 payload 传给客户端，同 key 自动去重 */
   const contentFetch = useAsyncData(
      'learning-content',
      () => loadFromServer(),
      { default: () => null },
   );

   /** 初始值：水合时 payload 里的数据直接可用，否则为空 */
   const articles = useState<LearningArticle[]>(
      'learning-content-articles',
      () => (contentFetch.data.value?.articles ?? []) as LearningArticle[],
   );
   const topics = useState<LearningTopic[]>(
      'learning-content-topics',
      () => (contentFetch.data.value?.topics ?? []) as LearningTopic[],
   );
   const courses = useState<LearningCourse[]>(
      'learning-content-courses',
      () => (contentFetch.data.value?.courses ?? []) as LearningCourse[],
   );

   const apply = (state: LearningContentState) => {
      articles.value = state.articles;
      topics.value = state.topics;
      courses.value = state.courses;
   };

   // 数据解析后灌进状态：SSR 在首帧渲染前，客户端水合时 payload 已就绪
   void contentFetch.then((result) => {
      if (result.data.value) apply(result.data.value);
   });

   /** 内容切片，给纯读函数用的普通对象 */
   const slice = computed(() => ({
      articles: articles.value,
      topics: topics.value,
      courses: courses.value,
   }));

   /** 写操作统一走服务端 mutation，失败直接抛给调用方 */
   const mutation = async <T>(run: () => Promise<T>): Promise<T> => {
      const result = await run();
      return result;
   };

   /** 增改之后把最新内容重新拉一遍，避免手工维护增量状态 */
   const refresh = async () => {
      const state = await loadFromServer();
      if (state) apply(state);
      return state;
   };

   /* ----- 文章 ----- */

   const addArticle = async (input: ArticleInput): Promise<LearningArticle> => {
      const { $trpc } = useNuxtApp();
      const created = await mutation(() =>
         $trpc.admin.learning.createArticle.mutate({
            title: input.title,
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
            description: input.description,
            coverPreset: input.coverPreset ?? 'slate',
            articleIds: articleCuids(input.articleIds),
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
            description: input.description,
            coverPreset: input.coverPreset ?? 'slate',
            articleIds: articleCuids(input.articleIds),
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
            description: input.description,
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
            description: input.description,
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

   /** 把数字 id 翻回服务端 cuid */
   const articleCuids = (ids: number[]) =>
      ids
         .map((id) => articles.value.find((item) => item.id === id)?.cuid)
         .filter((cuid): cuid is string => Boolean(cuid));

   const topicCuids = (ids: number[]) =>
      ids
         .map((id) => topics.value.find((item) => item.id === id)?.cuid)
         .filter((cuid): cuid is string => Boolean(cuid));

   return {
      articles,
      topics,
      courses,
      slice,
      addArticle,
      editArticle,
      addTopic,
      editTopic,
      addCourse,
      editCourse,
      submitCourseForReview,
      withdrawCourseReview,
      reviewCourseSubmission,
      refresh,
   };
};
