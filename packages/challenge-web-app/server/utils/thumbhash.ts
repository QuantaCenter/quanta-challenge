import { thumbhashToDataUrl } from '@challenge/shared/thumbhash/data-url';
import { logger } from '~~/server/utils/logger';
import { LRUMap } from './lru-map';

/** thumbhash → PNG data URL 的服务端缓存：缓存键是 thumbhash（内容决定结果，可长缓存）；L1 进程内 LRU + L2 Redis 两级。 */

// Redis 键前缀
const CACHE_KEY_PREFIX = 'thumbhash:dataurl:';
// 30 天。thumbhash 结果不可变，过期仅用于回收长期不再出现的旧封面。
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
// L1 容量。单张 data URL 约 1~3KB，1000 条约占用数 MB，足够覆盖热门封面。
const MEMORY_CACHE_SIZE = 1000;

const memoryCache = new LRUMap<string, string>(MEMORY_CACHE_SIZE);

/** 批量把 thumbhash 渲染为 PNG data URL，命中缓存直接返回；用 mget/pipeline 压缩往返，Redis 不可用时降级为实时解码。 */
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
   return dataUrl ?? null;
};
