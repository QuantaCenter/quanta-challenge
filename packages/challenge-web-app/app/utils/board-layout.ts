/**
 * 做题页三个板块的排列计算（纯函数，便于单测）。
 *
 * 板块 id：
 *   · `files`   —— 资源管理器
 *   · `code`    —— 代码编辑器（内部还含终端，竖向分割）
 *   · `preview` —— 实时预览
 *
 * `order` 与 `sizes` 都是**按视觉顺序**一一对应的数组：
 *   order[i] 占据第 i 个位置，宽度为 sizes[i]（百分比）。
 * 拖动某个板块到另一个板块的位置时，**宽度跟着板块一起走**，因此总和保持不变。
 */

export interface IBoardLayout {
   order: string[];
   sizes: number[];
}

/** 位置归一化：保证 order 覆盖全部板块、sizes 与 order 等长且为正数 */
export const normalizeBoardLayout = <Id extends string>(
   order: unknown,
   sizes: unknown,
   defaults: { order: Id[]; sizes: number[] }
): { order: Id[]; sizes: number[] } => {
   const validIds = new Set<string>(defaults.order);

   const rawOrder = Array.isArray(order) ? (order as string[]) : [];
   // 去重 + 只保留已知板块
   const seen = new Set<string>();
   const cleanOrder: Id[] = [];
   for (const id of rawOrder) {
      if (validIds.has(id) && !seen.has(id)) {
         seen.add(id);
         cleanOrder.push(id as Id);
      }
   }
   // 缺失的板块补回末尾（例如以后新增板块时旧数据里没有）
   for (const id of defaults.order) {
      if (!seen.has(id)) {
         seen.add(id);
         cleanOrder.push(id);
      }
   }

   const rawSizes = Array.isArray(sizes) ? (sizes as unknown[]) : [];
   const cleanSizes = cleanOrder.map((_, index) => {
      const value = Number(rawSizes[index]);
      return Number.isFinite(value) && value > 0
         ? value
         : (defaults.sizes[index] ?? 100 / cleanOrder.length);
   });

   return { order: cleanOrder, sizes: cleanSizes };
};

/**
 * 把 `from` 板块移动到 `to` 板块所在的位置（插入语义，其它板块依次让位）。
 *
 * 例：order = [files, code, preview]，把 preview 拖到 files 上
 *     -> [preview, files, code]
 */
export const moveBoard = (
   order: string[],
   sizes: number[],
   from: string,
   to: string
): IBoardLayout => {
   const fromIndex = order.indexOf(from);
   const toIndex = order.indexOf(to);

   if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return { order: [...order], sizes: [...sizes] };
   }

   const nextOrder = [...order];
   nextOrder.splice(fromIndex, 1);
   nextOrder.splice(toIndex, 0, from);

   const nextSizes = [...sizes];
   if (nextSizes.length === order.length) {
      const [moved] = nextSizes.splice(fromIndex, 1);
      nextSizes.splice(toIndex, 0, moved!);
   }

   return { order: nextOrder, sizes: nextSizes };
};

/**
 * 拖动某条分隔条后，重新分配它两侧板块的宽度。
 *
 * 返回新的完整 sizes 数组（总和保持不变）。
 */
export const resizeBoardPair = (
   sizes: number[],
   leftIndex: number,
   newLeftPercentOfPair: number
): number[] => {
   const left = sizes[leftIndex];
   const right = sizes[leftIndex + 1];
   if (left === undefined || right === undefined) return [...sizes];

   const pairTotal = left + right;
   const nextLeft = (pairTotal * newLeftPercentOfPair) / 100;

   const next = [...sizes];
   next[leftIndex] = nextLeft;
   next[leftIndex + 1] = pairTotal - nextLeft;
   return next;
};
