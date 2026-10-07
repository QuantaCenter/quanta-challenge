import { vi } from 'vitest';

/**
 * 内存版 Redis 替身。
 *
 * 只实现 device-flow 用到的命令，但**语义要真实**：
 *   · set 的 EX / NX 选项真的生效（NX 抢不到返回 null）—— user_code 去重依赖它；
 *   · del 返回被删除的键数量 —— "一次性消费"的原子性依赖它；
 *   · incr / expire / ttl 按真实行为实现。
 * 用 mock 库把这些细节替掉，就失去了测试的意义：设备码流程的安全属性
 * 恰恰建立在这几个命令的返回值语义上。
 */
export interface RedisDouble {
   get(key: string): Promise<string | null>;
   set(
      key: string,
      value: string,
      ...args: Array<string | number>
   ): Promise<'OK' | null>;
   del(...keys: string[]): Promise<number>;
   incr(key: string): Promise<number>;
   expire(key: string, seconds: number): Promise<number>;
   ttl(key: string): Promise<number>;
   /** 测试用：直接推进时间，越过 TTL */
   advanceTime(ms: number): void;
   /** 测试用：当前所有键 */
   keys(): string[];
}

interface Entry {
   value: string;
   expiresAt: number;
}

export const createRedisDouble = (now = { current: Date.now() }): RedisDouble => {
   const store = new Map<string, Entry>();

   const alive = (key: string): Entry | undefined => {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now.current) {
         store.delete(key);
         return undefined;
      }
      return entry;
   };

   return {
      async get(key) {
         return alive(key)?.value ?? null;
      },

      async set(key, value, ...args) {
         const flags = args.map((a) => String(a).toUpperCase());
         const exIndex = flags.indexOf('EX');
         const seconds = exIndex >= 0 ? Number(args[exIndex + 1]) : undefined;
         const onlyIfAbsent = flags.includes('NX');

         if (onlyIfAbsent && alive(key)) return null;

         store.set(key, {
            value,
            expiresAt: seconds ? now.current + seconds * 1000 : Number.POSITIVE_INFINITY,
         });
         return 'OK';
      },

      async del(...keys) {
         let removed = 0;
         for (const key of keys) {
            if (store.delete(key)) removed += 1;
         }
         return removed;
      },

      async incr(key) {
         const entry = alive(key);
         const next = (entry ? Number(entry.value) : 0) + 1;
         store.set(key, {
            value: String(next),
            expiresAt: entry?.expiresAt ?? Number.POSITIVE_INFINITY,
         });
         return next;
      },

      async expire(key, seconds) {
         const entry = alive(key);
         if (!entry) return 0;
         entry.expiresAt = now.current + seconds * 1000;
         return 1;
      },

      async ttl(key) {
         const entry = alive(key);
         if (!entry) return -2;
         if (entry.expiresAt === Number.POSITIVE_INFINITY) return -1;
         return Math.ceil((entry.expiresAt - now.current) / 1000);
      },

      advanceTime(ms) {
         now.current += ms;
      },

      keys() {
         return [...store.keys()];
      },
   };
};

/** 把替身接到 useRedis() 这个 Nitro 自动导入上 */
export const installRedisDouble = (
   redis: RedisDouble,
   now: { current: number } = { current: Date.now() },
) => {
   const fn = vi.fn(() => redis);
   vi.stubGlobal('useRedis', fn);
   return { now, restore: () => vi.unstubAllGlobals() };
};
