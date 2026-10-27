/** 文章点赞，状态存 localStorage，只区分已赞 / 未赞 */
const STORAGE_KEY = 'quanta-learning-article-likes-v1';

/** 整个客户端会话只读一次 localStorage */
let hydrated = false;

const readStorage = (): number[] | null => {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
         ? parsed.filter((id): id is number => typeof id === 'number')
         : null;
   } catch {
      // 隐私模式 / 脏数据：当作没有点赞记录
      return null;
   }
};

export const useArticleLikes = () => {
   // 挂载后再读本地数据，避免水合告警
   const liked = useState<number[]>('learning-article-likes', () => []);

   if (import.meta.client) {
      onMounted(() => {
         if (hydrated) return;
         hydrated = true;
         const stored = readStorage();
         if (stored) liked.value = stored;
      });
   }

   const persist = (next: number[]) => {
      liked.value = next;
      try {
         localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
         // 写不进去时内存里的状态照常生效
      }
   };

   const isLiked = (articleId: number) => liked.value.includes(articleId);

   /** 切换点赞，返回切换后的状态 */
   const toggle = (articleId: number): boolean => {
      const exists = isLiked(articleId);
      persist(
         exists
            ? liked.value.filter((id) => id !== articleId)
            : [articleId, ...liked.value],
      );
      return !exists;
   };

   return { likedArticleIds: computed(() => liked.value), isLiked, toggle };
};
