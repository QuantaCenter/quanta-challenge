import prisma from '../utils/prisma';
import { getRedis, getSubscriber } from './redis';
import { logger } from '../utils/logger';

export interface LoadedFunction {
   id: string;
   name: string;
   enabled: boolean;
   kvUserIsolated: boolean;
   timeoutMs: number;
   maxResponseBytes: number;
   activeVersion: {
      id: string;
      version: number;
      compiledCode: string;
   } | null;
}

const CACHE_TTL_MS = 30_000;
const INVALIDATE_CHANNEL = 'cf:registry:invalidate';

const cache = new Map<
   string,
   { value: LoadedFunction | null; expiresAt: number }
>();

/**
 * 按名字加载函数（含当前生效版本）。
 *
 * 内存缓存 30s + 发布/激活时主动失效 + Redis Pub/Sub 广播（多实例一致）。
 * 缓存 null（函数不存在）同样有效，避免不存在的函数名反复打库。
 */
export const loadFunction = async (
   name: string,
): Promise<LoadedFunction | null> => {
   const cached = cache.get(name);
   if (cached && cached.expiresAt > Date.now()) return cached.value;

   const row = await prisma.cloudFunction.findUnique({
      where: { name },
      include: {
         activeVersion: {
            select: { id: true, version: true, compiledCode: true },
         },
      },
   });

   const value: LoadedFunction | null = row
      ? {
           id: row.id,
           name: row.name,
           enabled: row.enabled,
           kvUserIsolated: row.kvUserIsolated,
           timeoutMs: row.timeoutMs,
           maxResponseBytes: row.maxResponseBytes,
           activeVersion: row.activeVersion,
        }
      : null;

   cache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
   return value;
};

/** 发布/激活/删除后调用；跨实例通过 Pub/Sub 同步失效。 */
export const invalidateFunction = async (name?: string): Promise<void> => {
   if (name) cache.delete(name);
   else cache.clear();

   try {
      await getRedis().publish(INVALIDATE_CHANNEL, name ?? '*');
   } catch (error) {
      logger.error(
         { error: error instanceof Error ? error.message : error, name },
         '广播云函数缓存失效失败（本实例缓存已清）',
      );
   }
};

export const initRegistrySubscriber = (): void => {
   const subscriber = getSubscriber();

   subscriber
      .subscribe(INVALIDATE_CHANNEL)
      .then(() =>
         logger.info({ channel: INVALIDATE_CHANNEL }, '已订阅云函数缓存失效频道'),
      )
      .catch((error) =>
         logger.error({ error }, '订阅云函数缓存失效频道失败'),
      );

   subscriber.on('message', (channel, message) => {
      if (channel !== INVALIDATE_CHANNEL) return;
      if (message === '*') cache.clear();
      else cache.delete(message);
   });
};
