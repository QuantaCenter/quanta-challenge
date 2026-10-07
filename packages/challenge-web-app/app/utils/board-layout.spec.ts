import { describe, expect, test } from 'vitest';
import {
   moveBoard,
   normalizeBoardLayout,
   resizeBoardPair,
} from './board-layout';

const DEFAULTS = {
   order: ['files', 'code', 'preview'] as const,
   sizes: [23, 42, 35],
};

describe('normalizeBoardLayout', () => {
   test('合法数据原样返回', () => {
      const result = normalizeBoardLayout(
         ['files', 'code', 'preview'],
         [23, 42, 35],
         { order: [...DEFAULTS.order], sizes: [...DEFAULTS.sizes] }
      );
      expect(result.order).toEqual(['files', 'code', 'preview']);
      expect(result.sizes).toEqual([23, 42, 35]);
   });

   test('缺失的板块补到末尾（新增板块时旧数据不会丢板块）', () => {
      const result = normalizeBoardLayout(['preview', 'files'], [30, 20], {
         order: ['files', 'code', 'preview'],
         sizes: [23, 42, 35],
      });
      expect(result.order).toEqual(['preview', 'files', 'code']);
      expect(result.sizes[2]).toBe(35);
   });

   test('未知板块被丢弃，重复项只保留第一次', () => {
      const result = normalizeBoardLayout(
         ['files', 'nope', 'files', 'code', 'preview'],
         [10, 10, 10, 10, 10],
         { order: ['files', 'code', 'preview'], sizes: [23, 42, 35] }
      );
      expect(result.order).toEqual(['files', 'code', 'preview']);
   });

   test('非法宽度回落到默认值', () => {
      const result = normalizeBoardLayout(['files', 'code', 'preview'], [
         0,
         Number.NaN,
         'x',
      ], { order: ['files', 'code', 'preview'], sizes: [23, 42, 35] });
      expect(result.sizes).toEqual([23, 42, 35]);
   });
});

describe('moveBoard', () => {
   test('把预览拖到最左边', () => {
      const result = moveBoard(['files', 'code', 'preview'], [23, 42, 35], 'preview', 'files');
      expect(result.order).toEqual(['preview', 'files', 'code']);
      // 宽度跟着板块走：preview 仍是 35
      expect(result.sizes).toEqual([35, 23, 42]);
   });

   test('把资源管理器拖到中间', () => {
      const result = moveBoard(['files', 'code', 'preview'], [23, 42, 35], 'files', 'code');
      expect(result.order).toEqual(['code', 'files', 'preview']);
      expect(result.sizes).toEqual([42, 23, 35]);
   });

   test('拖到自己身上不变', () => {
      const result = moveBoard(['files', 'code', 'preview'], [23, 42, 35], 'code', 'code');
      expect(result.order).toEqual(['files', 'code', 'preview']);
      expect(result.sizes).toEqual([23, 42, 35]);
   });

   test('未知板块 id 不会破坏数据', () => {
      const result = moveBoard(['files', 'code', 'preview'], [23, 42, 35], 'ghost', 'files');
      expect(result.order).toEqual(['files', 'code', 'preview']);
      expect(result.sizes).toEqual([23, 42, 35]);
   });

   test('任意移动后宽度总和守恒', () => {
      const total = 23 + 42 + 35;
      for (const [from, to] of [
         ['files', 'preview'],
         ['preview', 'code'],
         ['code', 'files'],
      ] as const) {
         const result = moveBoard(
            ['files', 'code', 'preview'],
            [23, 42, 35],
            from,
            to
         );
         expect(result.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6);
      }
   });
});

describe('resizeBoardPair', () => {
   test('按比例重新分配两侧宽度，总和不变', () => {
      const result = resizeBoardPair([23, 42, 35], 0, 50);
      expect(result[0]).toBeCloseTo(32.5, 6);
      expect(result[1]).toBeCloseTo(32.5, 6);
      expect(result[2]).toBe(35);
      expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
   });

   test('第二条分隔条只影响它两侧的板块', () => {
      const result = resizeBoardPair([23, 42, 35], 1, 50);
      expect(result[0]).toBe(23);
      expect(result[1]).toBeCloseTo(38.5, 6);
      expect(result[2]).toBeCloseTo(38.5, 6);
   });

   test('越界索引时原样返回', () => {
      expect(resizeBoardPair([23, 42, 35], 5, 50)).toEqual([23, 42, 35]);
   });
});
