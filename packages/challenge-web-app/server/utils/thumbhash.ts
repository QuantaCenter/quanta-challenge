import { thumbhashToDataUrl } from '@challenge/shared/thumbhash/data-url';
import { logger } from '~~/lib/logger';
import { LRUMap } from './lru-map';

/**
 * thumbhash → PNG data URL 的服务端缓存。
 *
 * 背景：`StImage` 为了「首帧即可见占位图」把解码从客户端挪到了 SSR
 * （见 commit d2fbade）。thumbhash 是纯计算，但题目列表一次会渲染几十张卡片，
 * 每次请求都要重复解码同一批 hash，且 Nuxt 还会把 tRPC 结果序列化进 hydration
 * payload —— 这正是需要缓存的地方。
 *
 * 缓存键是 thumbhash 本身（base64），而 thumbhash 由图片像素内容决定，
 * 内容不变则解码结果恒定，因此可以安全地长缓存。
 *
 * 两级缓存：
 * - L1：进程内 LRU，命中同一渲染周期内重复出现的 hash 时省掉一次网络往返；
 * - L2：Redis，跨请求 / 跨实例复用，需保证容器重启后仍然生效。
 */

// Redis 键前缀
const CACHE_KEY_PREFIX = 'thumbhash:dataurl:';
// 30 天。thumbhash 结果不可变，过期仅用于回收长期不再出现的旧封面。
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
// L1 容量。单张 data URL 约 1~3KB，1000 条约占用数 MB，足够覆盖热门封面。
const MEMORY_CACHE_SIZE = 1000;

const memoryCache = new LRUMap<string, string>(MEMORY_CACHE_SIZE);

/**
 * 批量把 thumbhash 渲染为 PNG data URL，命中缓存则直接返回。
 *
 * 用 `mget` / `pipeline` 把 N 次往返压成 2 次，列表页渲染几十张卡片时差距明显。
 * Redis 不可用时自动降级为实时解码，不影响页面渲染。
 */
export const renderThumbhashDataUrls = async (
   hashes: (string | null | undefined)[]
): Promise<(string | null)[]> => {
   const result: (string | null)[] = hashes.map(() => null);

   // hash -> 它在入参中的下标（同一 hash 可能出现多次，需要回填到每个位置）
   const pending = new Map<string, number[]>();

   hashes.forEach((hash, index) => {
      if (!hash) return;

      const cached = memoryCache.get(hash);
      if (cached !== undefined) {
         result[index] = cached;
         return;
      }

      const indices = pending.get(hash);
      if (indices) {
         indices.push(index);
      } else {
         pending.set(hash, [index]);
      }
   });

   if (pending.size === 0) {
      return result;
   }

   const uniqueHashes = Array.from(pending.keys());

   // L2：一次 mget 读取全部未命中项
   let redisHits: (string | null)[] = uniqueHashes.map(() => null);
   try {
      redisHits = await useRedis().mget(
         uniqueHashes.map((hash) => `${CACHE_KEY_PREFIX}${hash}`)
      );
   } catch (error) {
      logger.warn(
         { err: error, count: uniqueHashes.length },
         '读取 thumbhash 缓存失败，降级为实时解码',
      );
   }

   // 未命中的实时解码，并收集待写回 Redis 的键值
   const toWrite: [key: string, value: string][] = [];
   uniqueHashes.forEach((hash, i) => {
      const dataUrl = redisHits[i] || thumbhashToDataUrl(hash);
      if (!redisHits[i]) {
         toWrite.push([`${CACHE_KEY_PREFIX}${hash}`, dataUrl]);
      }

      memoryCache.set(hash, dataUrl);
      for (const index of pending.get(hash)!) {
         result[index] = dataUrl;
      }
   });

   // 写回 Redis（失败不影响本次返回）
   if (toWrite.length > 0) {
      try {
         const pipeline = useRedis().pipeline();
         for (const [key, value] of toWrite) {
            pipeline.set(key, value, 'EX', CACHE_TTL_SECONDS);
         }
         await pipeline.exec();
      } catch (error) {
         logger.warn(
            { err: error, count: toWrite.length },
            '写入 thumbhash 缓存失败',
         );
      }
   }

   return result;
};

/** 单个 thumbhash 的渲染入口，语义上等同批量接口长度为 1 的调用。 */
export const renderThumbhashDataUrl = async (
   hash: string | null | undefined
): Promise<string | null> => {
   const [dataUrl] = await renderThumbhashDataUrls([hash]);
   return dataUrl;
};
