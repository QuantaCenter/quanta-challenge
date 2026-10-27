export class LRUMap<K, V> extends Map<K, V> {
   constructor(public maxSize: number, ...args: any[]) {
      super(...args);
      if (maxSize <= 0) {
         throw new Error('maxSize must be greater than 0');
      }
   }

   private _removeObservers = new Set<(key: K, value: V) => void>();

   subscribeRemove(observer: (key: K, value: V) => void) {
      this._removeObservers.add(observer);
      return () => this._removeObservers.delete(observer);
   }

   /** 获取值，如果存在则将其移到最前面（最近使用） */
   override get(key: K): V | undefined {
      const value = super.get(key);
      if (value !== undefined) {
         // 重新设置以更新顺序（移到最前面）
         super.delete(key);
         super.set(key, value);
      }
      return value;
   }

   /** 设置键值对，如果超过最大容量则删除最旧的项 */
   override set(key: K, value: V): this {
      // 如果键已存在，先删除旧的
      if (super.has(key)) {
         super.delete(key);
      } else if (super.size >= this.maxSize) {
         // 如果达到最大容量，删除最旧的项（第一个）
         const firstKey = super.keys().next().value;
         if (typeof firstKey !== 'undefined') {
            const firstValue = super.get(firstKey);
            if (typeof firstValue !== 'undefined') {
               this._removeObservers.forEach((observer) =>
                  observer(firstKey, firstValue)
               );
            }
            super.delete(firstKey);
         }
      }

      // 添加新项到最后（最新）
      super.set(key, value);
      return this;
   }

   /** 获取最旧的键（最久未使用） */
   getOldestKey(): K | undefined {
      return super.keys().next().value;
   }

   /** 获取最新的键（最近使用） */
   getNewestKey(): K | undefined {
      const keys = Array.from(super.keys());
      return keys[keys.length - 1];
   }

   /** 检查是否为空 */
   get isEmpty(): boolean {
      return super.size === 0;
   }

   /** 检查是否已满 */
   get isFull(): boolean {
      return super.size >= this.maxSize;
   }

   /** 获取容量利用率（0-1之间的数字） */
   get utilization(): number {
      return super.size / this.maxSize;
   }

   /** 转换为普通对象（用于序列化等） */
   toObject(): Record<string, V> {
      const obj: Record<string, V> = {};
      super.forEach((value, key) => {
         obj[String(key)] = value;
      });
      return obj;
   }

   /** 转换为数组 */
   toArray(): [K, V][] {
      return Array.from(super.entries());
   }

   /** 从数组创建LRUMap */
   static fromArray<K, V>(entries: [K, V][], maxSize: number): LRUMap<K, V> {
      const lruMap = new LRUMap<K, V>(maxSize);
      entries.forEach(([key, value]) => {
         lruMap.set(key, value);
      });
      return lruMap;
   }

   /** 获取字符串表示 */
   override toString(): string {
      const entries = Array.from(super.entries());
      return `LRUMap(${this.maxSize}) { ${entries
         .map(([k, v]) => `${k} => ${v}`)
         .join(', ')} }`;
   }
}
