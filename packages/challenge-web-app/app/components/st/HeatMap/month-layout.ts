/**
 * 「提交情况」热力图的布局计算（纯函数，便于单测）。
 *
 * ## 设计意图（原实现的意图，勿按"每月实际天数"理解）
 *
 * 全年是一条**连续**的日期流，按"每列 rows 格"排布；每个月占**整列**，所以每块的
 * 格子数是 rows 的倍数。于是每个块里会出现：上月残留的几天 + 本月 + 为凑满最后一列
 * 而补进来的下月几天。全年因此是 `floor(365/9)*9 = 360` 格。
 *
 * ## 本次修正的三点
 *
 * 1. **格子的日期由连续流游标算出**。原模板里 `:month="month + 1" :day="day"` 每个块
 *    都从 1 重新数，完全没算这个偏移量 —— 于是 1/28~1/31 这类日期没有任何格子去查
 *    （数据在库里却永远不显示），而块尾还会出现 `03-32` 这种不存在的幽灵日期。
 * 2. **最后一块允许是残块**，把年尾剩下的天数收进来（2026 年 12 月那块是 32 格，
 *    最后一列只有 5 格），全年 365/366 天一天不丢。
 * 3. **闰年按"正在渲染的那一年"算**。原实现用的是 `new Date().getFullYear()`
 *    （真实当前年）而不是 `props.currentYear`，跨年查看时 2 月会差一天。
 */

/** 某年 12 个月各有多少天（`new Date(y, m + 1, 0)` 自动处理闰年 2 月） */
export const daysInMonths = (year: number): number[] =>
   Array.from(
      { length: 12 },
      (_, month) => new Date(year, month + 1, 0).getDate()
   );

/**
 * 每个月的块大小（格子数）：整列，**最后一块收残**。
 *
 * 例（2026 年，rows = 9）：`[27,27,36,27,27,36,27,36,27,27,36,32]`，合计 365。
 * 若不收残，最后一块是 27，合计 360 —— 12/27 之后就没有格子了。
 */
export const monthBlockSizes = (days: number[], rows = 9): number[] => {
   const safeRows = Math.max(1, Math.floor(rows));
   const total = days.reduce((sum, day) => sum + day, 0);

   const sizes: number[] = [];
   let offset = 0;
   for (const day of days) {
      const d = day + offset;
      offset = d % safeRows;
      sizes.push(d - offset);
   }

   if (sizes.length > 0) {
      const head = sizes
         .slice(0, -1)
         .reduce((sum, size) => sum + size, 0);
      // 保底 1 格，避免脏数据下出现空块导致布局塌掉
      sizes[sizes.length - 1] = Math.max(total - head, 1);
   }

   return sizes;
};

/**
 * 每个块里每个格子的**真实日期**（连续流游标）。
 *
 * 返回 `cells[块索引] = [{ month, day }, ...]`，`cells[i].length` 就是该块的格子数。
 * 展平之后必定是 1/1 → 12/31 的连续序列，无缺口、无重复、无幽灵日期。
 */
export const monthCells = (
   days: number[],
   rows = 9
): { month: number; day: number }[][] => {
   const sizes = monthBlockSizes(days, rows);
   const total = days.reduce((sum, day) => sum + day, 0);

   const result: { month: number; day: number }[][] = [];
   let monthIndex = 0;
   let day = 1;
   let emitted = 0;

   for (const size of sizes) {
      const block: { month: number; day: number }[] = [];

      for (let i = 0; i < size && emitted < total; i++) {
         block.push({ month: monthIndex + 1, day });
         emitted++;

         day++;
         if (day > (days[monthIndex] ?? 31)) {
            day = 1;
            if (monthIndex < days.length - 1) monthIndex++;
         }
      }

      result.push(block);
   }

   return result;
};
