import { CloudFunctionError } from '@challenge/shared/cloud-function-errors';

const DEFAULT_TTL_SECONDS = 24 * 3600;
const MAX_TTL_SECONDS = 7 * DEFAULT_TTL_SECONDS;
const MAX_KEYS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_OPS = 200;
const MAX_SCAN_RESULTS = 100;
const KEY_PATTERN = /^[A-Za-z0-9_.:/-]{1,256}$/;

interface Entry {
   value: string;
   bytes: number;
   expiresAt: number;
}

interface KvWrite {
   key: unknown;
   value: unknown;
   ttlSeconds?: unknown;
}

type KvHandler = {
   handle(op: string, args: unknown[]): Promise<unknown>;
};

const requireKey = (key: unknown): string => {
   if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new CloudFunctionError(
         'INVALID_INPUT',
         'KV key 须为 1–256 字符，只能包含字母、数字与 _ - . : /',
      );
   }
   return key;
};

const ttlSecondsOf = (ttl: unknown): number => {
   if (ttl == null) return DEFAULT_TTL_SECONDS;
   if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0) {
      throw new CloudFunctionError('INVALID_INPUT', 'ttlSeconds 必须是正数');
   }
   return Math.min(Math.floor(ttl), MAX_TTL_SECONDS);
};

const serialize = (value: unknown): string => {
   try {
      return JSON.stringify(value) ?? 'null';
   } catch {
      throw new CloudFunctionError('INVALID_INPUT', 'KV 值无法 JSON 序列化');
   }
};

const globTokensOf = (pattern: string): (string | RegExp)[] =>
   (pattern.match(/\\[\s\S]|\[(?:\\[\s\S]|[^\\[\]])+\]|[\s\S]/g) ?? []).map(
      (token) => {
         if (token.length === 1 || !token.startsWith('[')) return token;
         try {
            return new RegExp(`^${token}$`);
         } catch {
            return token;
         }
      },
   );

/** 星号逐字符尝试，避免把多个不受控的量词交给同一个正则。 */
const matchesGlob = (key: string, tokens: (string | RegExp)[]): boolean => {
   let offset = 0;
   let index = 0;
   let starIndex = -1;
   let starOffset = 0;
   while (offset < key.length) {
      const token = tokens[index];
      const char = key.charAt(offset);
      if (token === '*') {
         starIndex = index;
         starOffset = offset;
         index += 1;
      } else if (
         token === '?' ||
         token === char ||
         token === `\\${char}` ||
         (token instanceof RegExp && token.test(char))
      ) {
         index += 1;
         offset += 1;
      } else if (starIndex >= 0) {
         starOffset += 1;
         offset = starOffset;
         index = starIndex + 1;
      } else {
         return false;
      }
   }
   while (tokens[index] === '*') index += 1;
   return index === tokens.length;
};

/** 一次前端判题运行的 KV，同一轮的多次调用共享数据。 */
export class LocalCloudFunctionKv implements KvHandler {
   private readonly entries = new Map<string, Entry>();

   constructor(private readonly now: () => number = Date.now) {}

   forInvocation(): KvHandler {
      let ops = 0;
      const countOperation = () => {
         ops += 1;
         if (ops > MAX_OPS) {
            throw new CloudFunctionError(
               'KV_QUOTA_EXCEEDED',
               `单次调用的 KV 操作数超过上限 ${MAX_OPS}`,
            );
         }
      };
      return { handle: (op, args) => this.apply(op, args, countOperation) };
   }

   handle(op: string, args: unknown[]): Promise<unknown> {
      return this.apply(op, args);
   }

   private async apply(
      op: string,
      args: unknown[],
      countOperation?: () => void,
   ): Promise<unknown> {
      if (op !== 'mset') countOperation?.();
      const [first, second, third] = args;
      const now = this.now();
      for (const [key, entry] of this.entries) {
         if (entry.expiresAt <= now) this.entries.delete(key);
      }

      switch (op) {
         case 'get':
            return this.get(first);
         case 'set':
            return this.set(
               {
                  key: first,
                  value: second,
                  ttlSeconds: (third as { ttlSeconds?: unknown } | undefined)
                     ?.ttlSeconds,
               },
               now,
            );
         case 'del':
            return this.entries.delete(requireKey(first));
         case 'has':
            return this.entries.has(requireKey(first));
         case 'incr': {
            const key = requireKey(first);
            const by = second ?? 1;
            if (typeof by !== 'number' || !Number.isFinite(by)) {
               throw new CloudFunctionError(
                  'INVALID_INPUT',
                  'incr 的增量必须是数字',
               );
            }
            const entry = this.entries.get(key);
            const previous = Number(entry?.value);
            const value = (Number.isFinite(previous) ? previous : 0) + by;
            this.write(
               key,
               serialize(value),
               entry?.expiresAt ?? now + DEFAULT_TTL_SECONDS * 1000,
            );
            return value;
         }
         case 'expire': {
            const key = requireKey(first);
            const ttl = ttlSecondsOf(second);
            const entry = this.entries.get(key);
            if (!entry) return false;
            entry.expiresAt = now + ttl * 1000;
            return true;
         }
         case 'ttl': {
            const entry = this.entries.get(requireKey(first));
            return entry ? Math.round((entry.expiresAt - now) / 1000) : -2;
         }
         case 'keys': {
            const pattern = first ?? '*';
            if (
               typeof pattern !== 'string' ||
               !pattern ||
               /^[/:]/.test(pattern)
            ) {
               throw new CloudFunctionError(
                  'INVALID_INPUT',
                  'pattern 须为非空字符串，且不能以 / 或 : 开头',
               );
            }
            const tokens = globTokensOf(pattern);
            return [...this.entries.keys()]
               .filter((key) => matchesGlob(key, tokens))
               .slice(0, MAX_SCAN_RESULTS);
         }
         case 'mget':
            return Array.isArray(first)
               ? first.map((key) => this.get(key))
               : [];
         case 'mset':
            if (Array.isArray(first)) {
               for (const entry of first as KvWrite[]) {
                  countOperation?.();
                  this.set(entry, now);
               }
            }
            return;
         case 'clear': {
            const count = this.entries.size;
            this.entries.clear();
            return count;
         }
         default:
            throw new CloudFunctionError(
               'INVALID_INPUT',
               `未知 KV 操作：${op}`,
            );
      }
   }

   private get(key: unknown): unknown {
      const entry = this.entries.get(requireKey(key));
      return entry ? JSON.parse(entry.value) : null;
   }

   private set(entry: KvWrite, now: number): void {
      const key = requireKey(entry.key);
      const ttl = ttlSecondsOf(entry.ttlSeconds);
      if (ttl === 0) {
         throw new CloudFunctionError(
            'INVALID_INPUT',
            '写入时 TTL 须至少为 1 秒',
         );
      }
      this.write(key, serialize(entry.value), now + ttl * 1000);
   }

   private write(key: string, value: string, expiresAt: number): void {
      const bytes = Buffer.byteLength(value, 'utf8');
      if (bytes > MAX_VALUE_BYTES) {
         throw new CloudFunctionError(
            'KV_QUOTA_EXCEEDED',
            `KV 值大小超过上限 ${MAX_VALUE_BYTES} 字节`,
         );
      }
      const existing = this.entries.get(key);
      if (!existing && this.entries.size >= MAX_KEYS) {
         throw new CloudFunctionError(
            'KV_QUOTA_EXCEEDED',
            `key 数量超过隔离域上限 ${MAX_KEYS}`,
         );
      }
      let total = bytes - (existing?.bytes ?? 0);
      for (const entry of this.entries.values()) total += entry.bytes;
      if (total > MAX_BYTES) {
         throw new CloudFunctionError(
            'KV_QUOTA_EXCEEDED',
            `存储字节数超过隔离域上限 ${MAX_BYTES}`,
         );
      }
      this.entries.set(key, { value, bytes, expiresAt });
   }
}
