/** 做题页被 iframe 嵌入（学习页题目小节）时的约定：URL 带 `?embed=1`。 */

export const CHALLENGE_EMBED_QUERY = 'embed';

/** 嵌入页与宿主页之间 postMessage 的标识 */
export const CHALLENGE_EMBED_MESSAGE_SOURCE = 'quanta-challenge-embed';

export type TChallengeEmbedMessage = {
   source: typeof CHALLENGE_EMBED_MESSAGE_SOURCE;
   type: 'committed';
   recordId: number;
};

/** 供 store 在创建时读取：store 的生命周期与嵌入文档一致，只需判定一次 */
export const isChallengeEmbedRoute = (
   route: ReturnType<typeof useRoute> = useRoute(),
) => route.query[CHALLENGE_EMBED_QUERY] === '1';

/** 拼出嵌入模式的做题页地址 */
export const toChallengeEmbedUrl = (path: string) =>
   `${path}${path.includes('?') ? '&' : '?'}${CHALLENGE_EMBED_QUERY}=1`;

export const useChallengeEmbed = () => {
   const route = useRoute();
   const embedded = computed(() => isChallengeEmbedRoute(route));

   /** 嵌入模式下站内跳转需带上 embed 参数，否则会退回完整做题页布局 */
   const withEmbed = (path: string) =>
      embedded.value ? toChallengeEmbedUrl(path) : path;

   const notifyParent = (
      message: Omit<TChallengeEmbedMessage, 'source'>,
   ) => {
      if (!embedded.value || !import.meta.client) return;
      if (window.parent === window) return;
      window.parent.postMessage(
         { source: CHALLENGE_EMBED_MESSAGE_SOURCE, ...message },
         window.location.origin,
      );
   };

   return { embedded, withEmbed, notifyParent };
};
