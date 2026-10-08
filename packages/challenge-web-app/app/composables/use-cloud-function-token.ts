import useAuthStore from '~/stores/auth-store';

/**
 * 做题页的「云函数调用令牌」。
 *
 * 令牌是「短时随机 token + 服务端 Redis 映射」，每次签发都是一个新值。做题时用户会把
 * 令牌粘进自己的代码里，所以**只要旧令牌还没过期就复用它**：否则每次打开弹层都换一个，
 * 用户代码里的那个看起来就"失效"了。
 *
 * 状态放在模块作用域（而不是组件里），这样侧边栏组件因为 HMR / 重新挂载时不会重新签发；
 * 同时写进 sessionStorage，刷新页面也还能复用同一个。
 */
const STORAGE_KEY = 'quanta.cloud-function-token';
/** 与服务端 cloud-function-token.ts 的 TTL 保持一致。 */
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
/** 提前量：别卡在过期瞬间才换。 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedCloudFunctionToken {
   token: string;
   expiresAt: number;
   userId: string | null;
}

const state = reactive({
   token: '',
   expiresAt: 0,
   userId: null as string | null,
   loading: false,
   error: '',
});

/** 同一时刻只发一次请求（多个入口同时打开时共用）。 */
let pending: Promise<string> | null = null;
let hydrated = false;

const getStorage = () =>
   import.meta.client && typeof sessionStorage !== 'undefined'
      ? sessionStorage
      : null;

/** 首次使用时从 sessionStorage 恢复（同一个用户、且还没过期才有意义）。 */
const hydrate = () => {
   if (hydrated) return;
   hydrated = true;
   const storage = getStorage();
   if (!storage) return;
   try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as CachedCloudFunctionToken;
      if (!cached?.token) return;
      state.token = cached.token;
      state.expiresAt = cached.expiresAt;
      state.userId = cached.userId ?? null;
   } catch {
      /* 坏数据就直接忽略，下次重新签发 */
   }
};

export const useCloudFunctionToken = () => {
   const authStore = useAuthStore();
   const currentUserId = computed(() => authStore.user?.id ?? null);

   /** 现在是否可以直接复用已有令牌（还没到提前量、且是同一个用户）。 */
   const isUsable = () => {
      hydrate();
      if (!state.token) return false;
      if (state.userId !== currentUserId.value) return false;
      return Date.now() < state.expiresAt - REFRESH_MARGIN_MS;
   };

   /** 强制换一个新令牌。 */
   const refresh = async (): Promise<string> => {
      if (pending) return pending;
      state.loading = true;
      state.error = '';
      pending = $fetch<{ ok: boolean; data: { token: string } }>(
         '/api/cloud-function/token',
         { method: 'POST' },
      )
         .then((response) => {
            state.token = response.data.token;
            state.expiresAt = Date.now() + TOKEN_TTL_MS;
            state.userId = currentUserId.value;

            const storage = getStorage();
            if (storage) {
               try {
                  storage.setItem(
                     STORAGE_KEY,
                     JSON.stringify({
                        token: state.token,
                        expiresAt: state.expiresAt,
                        userId: state.userId,
                     } satisfies CachedCloudFunctionToken),
                  );
               } catch {
                  /* 存不下就算了，内存里还有 */
               }
            }

            return state.token;
         })
         .catch((error) => {
            state.error = (error as Error)?.message ?? '获取令牌失败';
            throw error;
         })
         .finally(() => {
            state.loading = false;
            pending = null;
         });
      return pending;
   };

   /** 有可用令牌就直接复用，否则才去签发。 */
   const ensure = async (): Promise<string> =>
      isUsable() ? state.token : await refresh();

   return {
      token: toRef(state, 'token'),
      loading: toRef(state, 'loading'),
      error: toRef(state, 'error'),
      isUsable,
      ensure,
      refresh,
   };
};
