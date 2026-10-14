import type {
   ArticleCoverPreset,
   Difficulty,
   LearningArticle,
   LearningProblemRef,
} from './use-learning';

/**
 * 收藏（题目 + 文章）。
 *
 * 收藏落在浏览器 localStorage 里；内容实体（文章 id、题目 baseId）以服务端为准。
 * 不再预置演示条目：旧的预置 id 来自 localStorage 时代的静态种子，
 * 在「服务端 cuid → 数字 id」的内容体系里永远解析不到实体，只会显示成死条目。
 */

export interface FavoriteProblem {
   /** 收藏键。有题号时按题号（文章引用题目用的也是题号），否则退化成版本号 */
   key: string;
   /** BaseProblems.id：能写进文章正文的 <Problem baseId={...} /> */
   baseId?: number;
   /** Problems.pid：能直接进做题页 */
   pid?: number;
   title: string;
   difficulty?: Difficulty;
   totalScore?: number;
   passRate?: number;
   imageName?: string | null;
   imageHash?: string | null;
   imageThumbhashUrl?: string | null;
}

export interface FavoriteArticle {
   articleId: number;
   title: string;
   summary: string;
   coverPreset?: ArticleCoverPreset;
   coverUrl?: string;
}

export interface FavoriteState {
   problems: FavoriteProblem[];
   articles: FavoriteArticle[];
}

export const problemFavoriteKey = (problem: {
   baseId?: number;
   pid?: number;
}): string =>
   problem.baseId !== undefined
      ? `base:${problem.baseId}`
      : `pid:${problem.pid ?? 0}`;

// 题库里的题目（LearningProblemRef）转成收藏项
export const toFavoriteProblem = (
   problem: LearningProblemRef,
): FavoriteProblem => ({
   key: problemFavoriteKey({ baseId: problem.baseId }),
   baseId: problem.baseId,
   title: problem.title,
   difficulty: problem.difficulty,
   totalScore: problem.totalScore,
});

// 文章转成收藏项
export const toFavoriteArticle = (article: LearningArticle): FavoriteArticle => ({
   articleId: article.id,
   title: article.title,
   summary: article.summary,
   coverPreset: article.coverPreset,
   coverUrl: article.coverUrl,
});

/**
 * 题库列表（`public.problem.listPublicProblems`）的条目转成收藏项。
 * 接口目前只回 `pid`；将来补上 baseId（`id`）时这里不用改，收藏键会自动换成题号。
 */
export const toFavoriteProblemFromApi = (problem: {
   id?: number;
   pid?: number;
   title?: string | null;
   difficulty?: Difficulty | null;
   totalScore?: number | null;
   passRate?: number | null;
   imageName?: string | null;
   imageHash?: string | null;
   imageThumbhashUrl?: string | null;
}): FavoriteProblem => ({
   key: problemFavoriteKey({ baseId: problem.id, pid: problem.pid }),
   baseId: problem.id,
   pid: problem.pid,
   title: problem.title ?? '匿名题目',
   difficulty: problem.difficulty ?? undefined,
   totalScore: problem.totalScore ?? undefined,
   passRate: problem.passRate ?? undefined,
   imageName: problem.imageName ?? null,
   imageHash: problem.imageHash ?? null,
   imageThumbhashUrl: problem.imageThumbhashUrl ?? null,
});

const DEFAULT_FAVORITES: FavoriteState = {
   problems: [],
   articles: [],
};

// v3：数字 id 从「静态种子序号」换成「cuid 哈希」，旧键里的快照 id 全部失准，
// 升键让旧的（含被预置数据污染的）收藏整体作废，用户重新点星标即可
const STORAGE_KEY = 'quanta-learning-favorites-v3';

const clone = (state: FavoriteState): FavoriteState => ({
   problems: state.problems.map((item) => ({ ...item })),
   articles: state.articles.map((item) => ({ ...item })),
});

const readStorage = (): FavoriteState | null => {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<FavoriteState>;
      return {
         problems: Array.isArray(parsed.problems) ? parsed.problems : [],
         articles: Array.isArray(parsed.articles) ? parsed.articles : [],
      };
   } catch {
      return null;
   }
};

let hydrated = false;

export const useFavorites = () => {
   // useState：SSR 用默认值渲染，客户端挂载后再读 localStorage，
   // 这样首帧不会因为本地数据与 SSR 不一致而产生水合告警。
   const state = useState<FavoriteState>('learning-favorites', () =>
      clone(DEFAULT_FAVORITES),
   );

   if (import.meta.client) {
      onMounted(() => {
         if (hydrated) return;
         hydrated = true;
         const stored = readStorage();
         if (stored) state.value = stored;
      });
   }

   const persist = (next: FavoriteState) => {
      state.value = next;
      try {
         localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
         // 隐私模式下写不进去，内存里的状态照常生效
      }
   };

   const isProblemFavorite = (key: string) =>
      state.value.problems.some((item) => item.key === key);

   const isArticleFavorite = (articleId: number) =>
      state.value.articles.some((item) => item.articleId === articleId);

   const toggleProblem = (problem: FavoriteProblem) => {
      const exists = isProblemFavorite(problem.key);
      persist({
         ...state.value,
         problems: exists
            ? state.value.problems.filter((item) => item.key !== problem.key)
            : [problem, ...state.value.problems],
      });
   };

   const toggleArticle = (article: FavoriteArticle) => {
      const exists = isArticleFavorite(article.articleId);
      persist({
         ...state.value,
         articles: exists
            ? state.value.articles.filter(
                 (item) => item.articleId !== article.articleId,
              )
            : [article, ...state.value.articles],
      });
   };

   const removeProblem = (key: string) =>
      persist({
         ...state.value,
         problems: state.value.problems.filter((item) => item.key !== key),
      });

   const removeArticle = (articleId: number) =>
      persist({
         ...state.value,
         articles: state.value.articles.filter(
            (item) => item.articleId !== articleId,
         ),
      });

   const problemFavorites = computed(() => state.value.problems);
   const articleFavorites = computed(() => state.value.articles);
   const favoriteCount = computed(
      () => state.value.problems.length + state.value.articles.length,
   );

   return {
      state,
      problemFavorites,
      articleFavorites,
      favoriteCount,
      isProblemFavorite,
      isArticleFavorite,
      toggleProblem,
      toggleArticle,
      removeProblem,
      removeArticle,
   };
};
