import { useLearningContentStore } from '~/composables/use-learning-store';
import { useLearningVisits } from '~/composables/use-learning-visits';
import { toArticle, toCourse, toTopic } from '~/utils/learning-content-source';
import type { LearningContentState } from '~/utils/learning-content-ops';
import {
   fetchLearningContent,
   type ServerArticle,
   type ServerCourse,
   type ServerTopic,
} from '~/utils/learning-content-source';

/**
 * 学习内容的加载入口。
 *
 * 课程 / 专题 / 文章的真源在**服务端**（设计文档 §17.7），
 * 这个插件在应用启动时拉一次灌进 store，于是所有页面（学习侧与创作侧）
 * 读到的都是库里的数据；本地 localStorage 只作为接口不可用时的兜底缓存。
 *
 * 几个刻意的选择：
 *   · `useAsyncData`：SSR 期间就取好数据，首帧即真内容，客户端复用 payload 不再重复请求；
 *   · 服务端直接用服务层函数取数（`$trpc` 是 client-only 插件），客户端才走 HTTP；
 *   · 接口失败不抛异常：学习侧只读接口，失败时保留缓存，整页 500 比"内容旧一点"严重得多。
 */
export default defineNuxtPlugin(() => {
   const store = useLearningContentStore();
   const visits = useLearningVisits();

   // 服务端预取的**学习进度**（Nitro 插件放进 event.context）：
   // 首帧就带上「已读 / 百分比 / 已做」，客户端挂载后不用再闪一次
   if (import.meta.server) {
      const progress = useRequestEvent()?.context?.learningProgress as
         | {
              visits: Record<string, string>;
              completions: Record<string, string>;
              solved: number[];
           }
         | undefined;
      if (progress) visits.hydrateFromServer(progress);
   }

   // 服务端预取的原始行（Nitro 插件放进 event.context）在这里映射成前端模型
   if (import.meta.server) {
      const prefetched = useRequestEvent()?.context?.learningContent as
         | {
              courses: Parameters<typeof toCourse>[0][];
              topics: Parameters<typeof toTopic>[0][];
              articles: Parameters<typeof toArticle>[0][];
              problems: Parameters<typeof toArticle>[1];
           }
         | undefined;
      if (prefetched) {
         store.hydrateFromServer(
            {
               courses: prefetched.courses.map(toCourse),
               topics: prefetched.topics.map(toTopic),
               articles: prefetched.articles.map((article) =>
                  toArticle(article, prefetched.problems),
               ),
            } as never,
            'server',
         );
      }
   }

   // SSR 已经由 server/plugins/learning-content.ts 预取（首帧即库里的内容）。
   // 客户端这里只做一次「兜底刷新」：万一 SSR 没取到（接口抖动），
   // 客户端还能补一次；拿不到就继续用本地缓存。
   if (import.meta.client) {
      onMounted(() => void store.syncFromServer());
   }
});
