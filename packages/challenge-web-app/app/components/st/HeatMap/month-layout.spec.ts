import { describe, expect, test } from 'vitest';
import { daysInMonths, monthBlockSizes, monthCells } from './month-layout';

const flatten = (cells: { month: number; day: number }[][]) =>
   cells.flatMap((block) => block);

const key = (c: { month: number; day: number }) =>
   `${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;

describe('daysInMonths', () => {
   test('平年 2 月 28 天，闰年 29 天（不是写死的）', () => {
      expect(daysInMonths(2026)[1]).toBe(28);
      expect(daysInMonths(2024)[1]).toBe(29);
      expect(daysInMonths(2000)[1]).toBe(29); // 400 年闰
      expect(daysInMonths(1900)[1]).toBe(28); // 整百不闰
   });

   test('按传入年份计算，与"真实当前年"无关', () => {
      // 同一个函数传不同年份必须给出不同结果（原实现写死了 new Date()）
      expect(daysInMonths(2024)).not.toEqual(daysInMonths(2026));
      expect(daysInMonths(2024).reduce((a, b) => a + b, 0)).toBe(366);
      expect(daysInMonths(2026).reduce((a, b) => a + b, 0)).toBe(365);
   });
});

describe('monthBlockSizes', () => {
   test('2026 年：整列块，最后一块收残，合计等于全年天数', () => {
      const sizes = monthBlockSizes(daysInMonths(2026), 9);
      expect(sizes).toEqual([27, 27, 36, 27, 27, 36, 27, 36, 27, 27, 36, 32]);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(365);
   });

   test('2024 闰年：合计 366，最后一块 33 格', () => {
      const sizes = monthBlockSizes(daysInMonths(2024), 9);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(366);
      expect(sizes[11]).toBe(33);
   });

   test('除最后一块外，每块都是 rows 的整数倍（整列）', () => {
      for (const year of [2024, 2025, 2026, 2027]) {
         const sizes = monthBlockSizes(daysInMonths(year), 9);
         for (const size of sizes.slice(0, -1)) {
            expect(size % 9).toBe(0);
         }
      }
   });

   test('rows 变化时依然保持"整列 + 收残"', () => {
      for (const rows of [1, 7, 9, 10]) {
         const sizes = monthBlockSizes(daysInMonths(2026), rows);
         expect(sizes.reduce((a, b) => a + b, 0)).toBe(365);
         for (const size of sizes.slice(0, -1)) {
            expect(size % rows).toBe(0);
         }
      }
   });
});

describe('monthCells（连续流游标）', () => {
   test('展平后正好是 1/1 → 12/31 的连续序列，无缺口无重复（2026）', () => {
      const cells = flatten(monthCells(daysInMonths(2026), 9));
      expect(cells).toHaveLength(365);

      const dims = daysInMonths(2026);
      const expected: string[] = [];
      for (let m = 0; m < 12; m++) {
         for (let d = 1; d <= dims[m]!; d++) {
            expected.push(key({ month: m + 1, day: d }));
         }
      }
      expect(cells.map(key)).toEqual(expected);
      expect(new Set(cells.map(key)).size).toBe(365);
   });

   test('闰年同样是连续的 366 天（2/29 有格子）', () => {
      const cells = flatten(monthCells(daysInMonths(2024), 9));
      expect(cells).toHaveLength(366);
      expect(cells.map(key)).toContain('02-29');
      expect(key(cells[cells.length - 1]!)).toBe('12-31');
   });

   test('回归：块内日期必须带偏移量（原来每块都从 1 重新数）', () => {
      const cells = monthCells(daysInMonths(2026), 9);

      // 第 1 块（"一月"）只有 27 格：1/1 ~ 1/27
      expect(key(cells[0]![0]!)).toBe('01-01');
      expect(key(cells[0]![26]!)).toBe('01-27');
      expect(cells[0]).toHaveLength(27);

      // 第 2 块（"二月"）承接上个月的残留：1/28 ~ 2/23（原来错标成 2/1 ~ 2/27）
      expect(key(cells[1]![0]!)).toBe('01-28');
      expect(key(cells[1]![26]!)).toBe('02-23');

      // 第 3 块（"三月"）是 36 格：2/24 ~ 3/31（原来会出现 3/32 ~ 3/36 幽灵日期）
      expect(key(cells[2]![0]!)).toBe('02-24');
      expect(key(cells[2]![35]!)).toBe('03-31');
   });

   test('回归：不再有幽灵日期（每月日期都不超过该月天数）', () => {
      const dims = daysInMonths(2026);
      for (const cell of flatten(monthCells(dims, 9))) {
         expect(cell.day).toBeGreaterThanOrEqual(1);
         expect(cell.day).toBeLessThanOrEqual(dims[cell.month - 1]!);
      }
   });

   test('年尾不再丢天数：最后一格是 12/31，且残块最后一列不满', () => {
      const cells = monthCells(daysInMonths(2026), 9);
      const last = cells[cells.length - 1]!;

      expect(key(last[last.length - 1]!)).toBe('12-31');
      // 最后一块 32 格 = 3 整列 + 5 格残列
      expect(last).toHaveLength(32);
      expect(last.length % 9).toBe(5);
   });

   test('块的格子数与 monthBlockSizes 一致', () => {
      const dims = daysInMonths(2026);
      const sizes = monthBlockSizes(dims, 9);
      const cells = monthCells(dims, 9);
      expect(cells.map((block) => block.length)).toEqual(sizes);
   });
});
