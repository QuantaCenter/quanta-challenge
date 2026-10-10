import { getCookie } from 'h3';
import { verifyToken } from '~~/server/utils/jwt';
import { loadUserProgress } from '~~/server/trpc/services/learning-progress';
import {
   listArticles,
   listProblemSummaries,
   listPublishedCourses,
   listPublishedTopics,
   resolveArticleProblems,
} from '~~/server/trpc/services/learning-read';


/**
 * 服务端渲染前把「学习内容」取好，放进 event.context。
 *
 * 为什么不在页面 / Nuxt 插件里取：`useLearningContentStore()` 的初始值会在页面
 * setup 阶段就落位，等插件里的 `useAsyncData` 回来时，页面**首帧**已经用种子内容渲染过了
 * （浏览器里会看到一次闪烁，SSR 的 HTML 也是种子内容）。
 * Nitro 插件在渲染前执行，从这里灌进 store 的初始值，首帧就与库里一致。
 */
/**
 * 从 cookie 里读当前用户（与 tRPC 的 `createContext` 同一套 token）。
 * 未登录 / token 失效都返回 null —— 进度是可选增强，不该影响页面渲染。
 */
const readUserId = async (event: {
   context: Record<string, unknown>;
}): Promise<string | null> => {
   try {
      const token = getCookie(event as never, 'quanta_access_token');
      if (!token) return null;
      return verifyToken(token).userId;
   } catch {
      return null;
   }
};

export default defineNitroPlugin((nitroApp) => {
   nitroApp.hooks.hook('request', async (event: { path?: string; context: Record<string, unknown> }) => {
      // 只处理页面请求：tRPC / 静态资源不需要这份数据
      const path = event.path ?? '';
      if (
         path.startsWith('/api/') ||
         path.startsWith('/_nuxt/') ||
         path.startsWith('/__nuxt')
      ) {
         return;
      }

      try {
         const [courses, topics, articles] = await Promise.all([
            listPublishedCourses(),
            listPublishedTopics(),
            listArticles(),
         ]);
         const baseIds = [
            ...new Set(
               articles.flatMap((article) =>
                  [
                     ...article.source.matchAll(
                        /<Problem\s+baseId=\{(\d+)\}\s*\/>/g,
                     ),
                  ].map((match) => Number(match[1])),
               ),
            ),
         ];
         const problems =
            baseIds.length > 0 ? await resolveArticleProblems(baseIds) : [];

         // 只缓存**原始行**：这里是服务端，不该依赖 app 层的映射函数
         // （否则 server typecheck 会去查 app 代码，而 app 代码由 vue-tsc 负责）。
         event.context.learningContent = { courses, topics, articles, problems };

         // 顺带把**当前用户的学习进度**取好：卡片上的「已读 / 百分比 / 已做」首帧就有值，
         // 不用等客户端挂载后再拉一次。未登录（没有合法 token）就跳过。
         const userId = await readUserId(event);
         if (userId) {
            event.context.learningProgress = await loadUserProgress(userId);
         }
      } catch (error) {
         // 取数失败不能挡住页面：客户端还有一次机会（插件里走 HTTP），
         // 再不行就用本地缓存兜底
         console.warn(
            '[learning] 服务端预取内容失败：',
            (error as Error)?.message,
         );
      }
   });
});
