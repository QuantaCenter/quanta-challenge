import { config } from '../config';
import { fail } from '../utils/errors';
import { getRedis } from './redis';

/** 逻辑 key 允许的字符集；禁止空格、控制字符、以及会破坏前缀的裸 `*`。 */
const LOGICAL_KEY_PATTERN = /^[A-Za-z0-9_\-.:/]+$/;

export interface KvScopeOptions {
   functionId: string;
   userIsolated: boolean;
   userId?: string | null;
   /** 调用方 keyId，用于无用户时的系统作用域。 */
   keyId: string;
}

/**
 * 计算 KV 隔离域。
 *
 * - 用户隔离开启 + 有用户 → `u:<userId>`（每个用户独立）
 * - 用户隔离开启 + 无用户 → `sys:<keyId>`（内部系统调用，绝不混入某真实用户空间）
 * - 用户隔离关闭          → `s`（函数级共享）
 */
export const buildScope = (options: KvScopeOptions): string => {
   if (!options.userIsolated) return 's';
   if (options.userId) return `u:${options.userId}`;
   return `sys:${options.keyId}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Lua 脚本：把"写 + 配额计数"变成原子操作，避免并发下计数漂移。
// ARGV 约定见各脚本头部注释。
// ─────────────────────────────────────────────────────────────────────────────

// KEYS[1]=data KEYS[2]=meta
// ARGV[1]=value ARGV[2]=ttl ARGV[3]=maxKeys ARGV[4]=maxBytes
// 返回 {status, keys, bytes}，status: 1=ok, -1=key 超限, -2=字节超限
const SET_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
local existed = 0
local oldLen = 0
if existing then existed = 1; oldLen = string.len(existing) end
local newLen = string.len(ARGV[1])
local keys = tonumber(redis.call('HGET', KEYS[2], 'keys') or '0')
local bytes = tonumber(redis.call('HGET', KEYS[2], 'bytes') or '0')
local nextKeys = keys + (1 - existed)
local nextBytes = bytes - oldLen + newLen
if nextKeys > tonumber(ARGV[3]) then return {-1, keys, bytes} end
if nextBytes > tonumber(ARGV[4]) then return {-2, keys, bytes} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
redis.call('HSET', KEYS[2], 'keys', nextKeys, 'bytes', nextBytes)
return {1, nextKeys, nextBytes}
`;

// KEYS[1]=data KEYS[2]=meta
const DEL_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if not existing then return 0 end
redis.call('DEL', KEYS[1])
local keys = tonumber(redis.call('HGET', KEYS[2], 'keys') or '0')
local bytes = tonumber(redis.call('HGET', KEYS[2], 'bytes') or '0')
redis.call('HSET', KEYS[2], 'keys', math.max(0, keys - 1), 'bytes', math.max(0, bytes - string.len(existing)))
return 1
`;

// KEYS[1]=data KEYS[2]=meta
// ARGV[1]=by ARGV[2]=maxKeys ARGV[3]=maxBytes ARGV[4]=defaultTtl
// 返回 {status, value}，status: 1=ok, -1=key 超限, -2=字节超限
const INCR_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
local existed = 0
local oldLen = 0
if existing then existed = 1; oldLen = string.len(existing) end
local n = tonumber(existing) or 0
local v = n + tonumber(ARGV[1])
local newVal
if v == math.floor(v) and math.abs(v) < 1e15 then
  newVal = string.format('%d', v)
else
  newVal = tostring(v)
end
local newLen = string.len(newVal)
local keys = tonumber(redis.call('HGET', KEYS[2], 'keys') or '0')
local bytes = tonumber(redis.call('HGET', KEYS[2], 'bytes') or '0')
local nextKeys = keys + (1 - existed)
local nextBytes = bytes - oldLen + newLen
if nextKeys > tonumber(ARGV[2]) then return {-1, 0} end
if nextBytes > tonumber(ARGV[3]) then return {-2, 0} end
redis.call('SET', KEYS[1], newVal, 'KEEPTTL')
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4])) end
redis.call('HSET', KEYS[2], 'keys', nextKeys, 'bytes', nextBytes)
return {1, v}
`;

export class CloudFunctionKv {
   private readonly baseKey: string;
   private readonly metaKey: string;
   private ops = 0;

   constructor(private readonly scopeOptions: KvScopeOptions) {
      const scope = buildScope(scopeOptions);
      this.baseKey = `cf:kv:${scopeOptions.functionId}:${scope}:`;
      this.metaKey = `cf:kvmeta:${scopeOptions.functionId}:${scope}`;
   }

   /** 每个调用允许的 KV 操作总数，防止单次调用刷爆 Redis。 */
   private tick(): void {
      this.ops += 1;
      if (this.ops > config.kv.maxOpsPerInvoke) {
         fail(
            'KV_QUOTA_EXCEEDED',
            `单次调用的 KV 操作数超过上限 ${config.kv.maxOpsPerInvoke}`,
         );
      }
   }

   private fullKey(key: string): string {
      if (typeof key !== 'string' || key.length === 0) {
         fail('INVALID_INPUT', 'KV key 不能为空');
      }
      if (key.length > config.kv.maxKeyLength) {
         fail(
            'INVALID_INPUT',
            `KV key 长度超过上限 ${config.kv.maxKeyLength}`,
         );
      }
      if (!LOGICAL_KEY_PATTERN.test(key)) {
         fail('INVALID_INPUT', 'KV key 只能包含字母、数字与 _ - . : /');
      }
      const full = this.baseKey + key;
      // 防御性断言：拼接结果必须仍在当前隔离域内。
      if (!full.startsWith(this.baseKey)) {
         fail('INVALID_INPUT', 'KV key 越界');
      }
      return full;
   }

   private normalizeTtl(ttlSeconds?: number): number {
      if (ttlSeconds === undefined || ttlSeconds === null) {
         return config.kv.defaultTtlSeconds;
      }
      if (
         typeof ttlSeconds !== 'number' ||
         !Number.isFinite(ttlSeconds) ||
         ttlSeconds <= 0
      ) {
         fail('INVALID_INPUT', 'ttlSeconds 必须是正数');
      }
      return Math.min(Math.floor(ttlSeconds), config.kv.maxTtlSeconds);
   }

   private async rateLimit(): Promise<void> {
      const second = Math.floor(Date.now() / 1000);
      const key = `cf:rl:kv:${this.scopeOptions.functionId}:${this.scopeOptions.userId ?? this.scopeOptions.keyId}:${second}`;
      const redis = getRedis();
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 5);
      if (count > config.kv.ratePerSecond) {
         fail('KV_QUOTA_EXCEEDED', 'KV 操作过于频繁，请降低频率');
      }
   }

   async get(key: string): Promise<unknown> {
      this.tick();
      const full = this.fullKey(key);
      const raw = await getRedis().get(full);
      return raw === null ? null : safeParse(raw);
   }

   async set(
      key: string,
      value: unknown,
      options?: { ttlSeconds?: number },
   ): Promise<void> {
      this.tick();
      await this.rateLimit();

      const full = this.fullKey(key);
      const ttl = this.normalizeTtl(options?.ttlSeconds);

      let serialized: string;
      try {
         const json = JSON.stringify(value);
         serialized = json === undefined ? 'null' : json;
      } catch {
         fail('INVALID_INPUT', 'KV 值无法 JSON 序列化');
      }

      const bytes = Buffer.byteLength(serialized, 'utf8');
      if (bytes > config.kv.maxValueBytes) {
         fail(
            'KV_QUOTA_EXCEEDED',
            `KV 值大小超过上限 ${config.kv.maxValueBytes} 字节`,
         );
      }

      const result = (await getRedis().eval(
         SET_SCRIPT,
         2,
         full,
         this.metaKey,
         serialized,
         String(ttl),
         String(config.kv.maxKeysPerScope),
         String(config.kv.maxBytesPerScope),
      )) as [number, number, number];

      if (Number(result[0]) === -1) {
         fail(
            'KV_QUOTA_EXCEEDED',
            `key 数量超过隔离域上限 ${config.kv.maxKeysPerScope}`,
         );
      }
      if (Number(result[0]) === -2) {
         fail(
            'KV_QUOTA_EXCEEDED',
            `存储字节数超过隔离域上限 ${config.kv.maxBytesPerScope}`,
         );
      }
   }

   async del(key: string): Promise<boolean> {
      this.tick();
      const full = this.fullKey(key);
      const result = await getRedis().eval(
         DEL_SCRIPT,
         2,
         full,
         this.metaKey,
      );
      return Number(result) > 0;
   }

   async has(key: string): Promise<boolean> {
      this.tick();
      const full = this.fullKey(key);
      return (await getRedis().exists(full)) === 1;
   }

   async incr(key: string, by = 1): Promise<number> {
      this.tick();
      if (typeof by !== 'number' || !Number.isFinite(by)) {
         fail('INVALID_INPUT', 'incr 的增量必须是数字');
      }
      const full = this.fullKey(key);

      const result = (await getRedis().eval(
         INCR_SCRIPT,
         2,
         full,
         this.metaKey,
         String(by),
         String(config.kv.maxKeysPerScope),
         String(config.kv.maxBytesPerScope),
         String(config.kv.defaultTtlSeconds),
      )) as [number, number];

      if (Number(result[0]) === -1) {
         fail('KV_QUOTA_EXCEEDED', 'key 数量超过隔离域上限');
      }
      if (Number(result[0]) === -2) {
         fail('KV_QUOTA_EXCEEDED', '存储字节数超过隔离域上限');
      }
      return Number(result[1]);
   }

   async expire(key: string, ttlSeconds: number): Promise<boolean> {
      this.tick();
      const full = this.fullKey(key);
      const ttl = this.normalizeTtl(ttlSeconds);
      return (await getRedis().expire(full, ttl)) === 1;
   }

   async ttl(key: string): Promise<number> {
      this.tick();
      const full = this.fullKey(key);
      return getRedis().ttl(full);
   }

   async keys(pattern = '*'): Promise<string[]> {
      this.tick();

      if (typeof pattern !== 'string' || pattern.length === 0) {
         fail('INVALID_INPUT', 'pattern 不能为空');
      }
      if (pattern.startsWith('/') || pattern.startsWith(':')) {
         fail('INVALID_INPUT', 'pattern 不能以 / 或 : 开头');
      }
      const fullPattern = this.baseKey + pattern;
      if (!fullPattern.startsWith(this.baseKey)) {
         fail('INVALID_INPUT', 'pattern 越界');
      }

      const redis = getRedis();
      let cursor = '0';
      const found: string[] = [];

      do {
         const [next, batch] = await redis.scan(
            cursor,
            'MATCH',
            fullPattern,
            'COUNT',
            100,
         );
         cursor = next;
         for (const full of batch) {
            found.push(full.slice(this.baseKey.length));
            if (found.length >= config.kv.scanLimit) return found;
         }
      } while (cursor !== '0');

      return found;
   }

   async mget(keys: string[]): Promise<unknown[]> {
      this.tick();
      if (!Array.isArray(keys) || keys.length === 0) return [];
      const fullKeys = keys.map((key) => this.fullKey(key));
      const values = await getRedis().mget(...fullKeys);
      return values.map((raw) => (raw === null ? null : safeParse(raw)));
   }

   async mset(
      entries: { key: string; value: unknown; ttlSeconds?: number }[],
   ): Promise<void> {
      if (!Array.isArray(entries) || entries.length === 0) return;
      for (const entry of entries) {
         await this.set(entry.key, entry.value, {
            ttlSeconds: entry.ttlSeconds,
         });
      }
   }

   async clear(): Promise<number> {
      this.tick();
      const redis = getRedis();
      let cursor = '0';
      let deleted = 0;

      do {
         const [next, batch] = await redis.scan(
            cursor,
            'MATCH',
            `${this.baseKey}*`,
            'COUNT',
            100,
         );
         cursor = next;
         if (batch.length > 0) {
            deleted += await redis.unlink(...batch);
         }
      } while (cursor !== '0');

      await redis.del(this.metaKey);
      return deleted;
   }

   /** 供 Worker RPC 调用的分发入口。 */
   async handle(op: string, args: unknown[]): Promise<unknown> {
      switch (op) {
         case 'get':
            return this.get(args[0] as string);
         case 'set':
            return this.set(
               args[0] as string,
               args[1],
               args[2] as { ttlSeconds?: number } | undefined,
            );
         case 'del':
            return this.del(args[0] as string);
         case 'has':
            return this.has(args[0] as string);
         case 'incr':
            return this.incr(args[0] as string, (args[1] as number) ?? 1);
         case 'expire':
            return this.expire(args[0] as string, args[1] as number);
         case 'ttl':
            return this.ttl(args[0] as string);
         case 'keys':
            return this.keys((args[0] as string) ?? '*');
         case 'mget':
            return this.mget(args[0] as string[]);
         case 'mset':
            return this.mset(
               args[0] as { key: string; value: unknown; ttlSeconds?: number }[],
            );
         case 'clear':
            return this.clear();
         default:
            return fail('INVALID_INPUT', `未知 KV 操作：${op}`);
      }
   }
}

const safeParse = (raw: string): unknown => {
   try {
      return JSON.parse(raw);
   } catch {
      return raw;
   }
};
