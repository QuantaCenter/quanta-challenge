/**
 * 进度与完成度的**纯规则**。
 *
 * 为什么单独成模块：它只依赖「内容 + 本地记录」，不碰 Nuxt 运行时
 * （composable 里的 `useState`、store 的 `#imports`）。放在 composable 里时
 * vitest 一 import 就炸（`Cannot find module '#imports'`），
 * 于是「只读了一篇算不算整个专题已读」这种规则**没法被测试保护**。
 *
 * 依赖方向：本模块只 `import type`，`use-learning.ts` 反向 re-export 它。
 */

import type {
   LearningArticle,
   LearningCourse,
   LearningTopic,
} from '~/composables/use-learning';
import { isDoneForever } from '~/utils/learning-visits';

/**
 * 从一批文章里挑出某个专题引用的那些（顺序跟专题的 articleIds 一致）。
 *
 * 刻意做成"从给定列表里挑"，而不是自己去查全局内容：
 * 这样本模块不依赖任何运行时上下文，规则可以被单测直接调用。
 */
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
   /** 纯阅读专题（没有题）：用"已读"表达完成，不显示 0% 进度条 */
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
   /** 纯阅读课程（没有题）：用"已读"表达，不显示 0% 进度条 */
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

/**
 * 「这道题我做过了吗」。
 *
 * 以前这里是写死的 `COMPLETED_BASE_IDS = {7}`（假装"主题切换做过了"），
 * 于是每个人的进度条都一样。现在读真实的做题记录
 * （提交成功后写进 localStorage，见 use-learning-visits.ts）。
 */
const isSolved = (baseId: number, visits: VisitSlice): boolean =>
   Boolean(visits.solved?.[String(baseId)]);

/**
 * 访问记录（「最近学习」的数据来源）。
 *
 * 以前这里是写死的常量，id 还按「第 n 篇 = 100 + n」编；文章改成服务端内容后
 * id 变成 cuid 的哈希，一条都匹配不上，于是「最近学习」永远是空的。
 * 现在改为真实记录：打开文章/专题时写进 localStorage（见 use-learning-visits.ts），
 * 按 cuid 存，能跨刷新保留。
 */
/**
 * 访问记录（「最近学习」的数据来源）。
 *
 * ⚠️ 必须**显式传入**，不能在 `articleProgress` / `topicProgress` 里懒调
 * `useLearningVisits()`：那两个函数会在 computed 里被调用，而 composable 内部的
 * `useState` 一旦在 setup 之外首次执行，就会抛
 * 「A composable that requires access to the Nuxt instance was called outside of ...」
 * ——整个页面 500（这个坑踩过一次）。
 *
 * 页面 / 组件在 setup 里取一次记录，按参数传进这些纯读函数。
 */
export interface VisitSlice {
   articles: Record<string, { cuid: string; at: string }>;
   topics: Record<string, { cuid: string; at: string }>;
   /** 做过的题：键是题号 baseId（字符串），值是最后提交时间 */
   solved?: Record<string, string>;
   /** 已完成的专题 / 文章：键是 cuid（不可逆，见 utils/learning-visits.ts） */
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
      // 已下架 / 已删除的题按 §8.8 计入已完成（做没做过已无从判断）
      (p) => p.unavailable || isSolved(p.baseId, visits),
   ).length;
   const isReadingOnly = total === 0;
   /**
    * 完成状态**不可逆**：一旦这个专题被标记为完成，
    * 即使题目更新了版本、分母变大，这里也算完成、进度按 100% 显示。
    * （产品口径见 docs/LEARNING_SYSTEM_DESIGN.md §17.9）
    */
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

/**
 * 这道题我做过了吗（读真实记录，不传记录时视为未做）。
 *
 * 页面里请把访问/做题记录显式传进来（`visits.solved`）；
 * 不带参数只用于没有记录上下文的场景（例如编辑器预览）。
 */
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
   /** 这个专题下的文章（由调用方用内容切片解析好传进来） */
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

   /**
    * 完成 = 有题目且题目全部做完（**不可逆**）。
    *
    * 两个刻意的选择：
    *   · 不能只看"文章都读完了"——文章读完但题没做时百分比还是 0%，
    *     却打勾，就是「0% + 已完成」这种矛盾状态；
    *   · 纯阅读专题（没有题）不标"完成"，而是标"已读"，
    *     否则卡片上会出现「0% + 已完成」——0% 是因为没有题可做，不是没做完。
    */
   const doneForever = isDoneForever(visits.done ?? {}, topic.cuid);
   const completed =
      doneForever ||
      (articles.length > 0 && problemCount > 0 && doneProblems === problemCount);
   const isReadingOnly = articles.length > 0 && problemCount === 0;
   /**
    * 「已读」= **每一篇都读过**。
    *
    * 不能用"打开过这个专题（或其中任意一篇）"来判定：那样只读了 2 篇里的 1 篇，
    * 专题就显示成已读了。专题的已读是"这个专题的内容都看过了"。
    */
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
   /** 这门课程下的专题（按顺序）与去重后的文章（由调用方解析好传进来） */
   topics: LearningTopic[] = [],
   courseArticles: LearningArticle[] = [],
): CourseProgress {
   const articles = courseArticles;
   const topicStates = topics.map((topic) =>
      topicProgress(topic, visits, articlesOfTopicFrom(topic, courseArticles)),
   );
   const problemCount = topicStates.reduce((sum, s) => sum + s.problemCount, 0);
   const doneProblems = topicStates.reduce((sum, s) => sum + s.doneProblems, 0);
   // 课程完成时间：暂时没有单独落库的"完成时刻"，由题目进度推导（见下）。
   // 以前这里写死了 5001（HTML）的完成时间，换成服务端 cuid 后永远匹配不上。
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
      /**
       * 不可逆：一旦完成就永远是完成（新增专题 / 题目不会撤销）。
       * 有题目的课程必须题都做完；没题目的课程读完即完成（用 read 表达）。
       */
      completed:
         doneForever ||
         (completedAt !== null && problemCount === 0) ||
         (topics.length > 0 &&
            problemCount > 0 &&
            doneProblems === problemCount),
      isReadingOnly: topics.length > 0 && problemCount === 0,
      // 同样要求**全部**专题都已读，而不是"读过其中一个"
      read:
         problemCount === 0 &&
         topicStates.length > 0 &&
         topicStates.every((state) => state.read),
      completedAt,
      lastOpenedAt: latest(topicStates.map((s) => s.lastOpenedAt)),
   };
}

// 发布校验：0 专题的课程可以存草稿，但不能发布
