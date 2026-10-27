import { useAsyncData, useState } from '#imports';
import type {
   LearningArticle,
   LearningContentState,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';
import { fetchLearningContent } from '~/utils/learning-content-source';

/**
 * 学习内容的共享状态：全量拉一次，增改后重灌。
 * 写请求放在各自的表单 / 管理组件里，这里只管状态与刷新。
 */
export const useLearningContentStore = () => {
   /** 用 tRPC 客户端拉一次全量内容（SSR 与客户端都能用） */
   const loadFromServer = async (): Promise<LearningContentState | null> => {
      try {
         const { $trpc } = useNuxtApp();
         return await fetchLearningContent(
            $trpc as unknown as Parameters<typeof fetchLearningContent>[0],
         );
      } catch (error) {
         console.warn('[learning] 内容加载失败：', error);
         return null;
      }
   };

   /** 全量内容一次拉取：SSR 在渲染前完成并随 payload 传给客户端，同 key 自动去重 */
   const contentFetch = useAsyncData('learning-content', loadFromServer, {
      default: () => null,
   });

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

   /** 全量重拉并灌回状态，返回最新切片（可能为 null：加载失败） */
   const refresh = async (): Promise<LearningContentState | null> => {
      const state = await loadFromServer();
      if (state) apply(state);
      return state;
   };

   return { articles, topics, courses, refresh };
};
