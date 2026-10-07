import { describe, expect, test } from 'vitest';
import {
   DIVIDER_PX,
   KEYBOARD_STEP_FAST_PERCENT,
   KEYBOARD_STEP_PERCENT,
   MIN_PANEL_PERCENT,
   clampPercent,
   computeFlexBasis,
   keyboardDelta,
   percentFromDrag,
   percentFromFit,
} from './layout-math';

/** 把 `calc(77% - 0.75rem)` 这类 basis 字符串换算成像素 */
const basisToPx = (basis: string, containerSize: number) => {
   const percent = Number(/([\d.]+)%/.exec(basis)?.[1] ?? NaN);
   const remMatch = /([\d.]+)rem/.exec(basis);
   const rem = remMatch ? Number(remMatch[1]) : 0;
   return (percent / 100) * containerSize - rem * 16;
};

describe('computeFlexBasis', () => {
   test('start 侧直接用百分比，end 侧扣掉分隔条占位', () => {
      expect(computeFlexBasis(23)).toEqual({
         start: '23%',
         end: 'calc(77% - 0.75rem)',
      });
   });

   test('两侧面板 + 分隔条恰好铺满容器（回归：曾多出 0.5rem）', () => {
      const containerSize = 1000;
      const dividerWidth = DIVIDER_PX;

      for (const percent of [4, 23, 50, 55, 65, 90]) {
         const basis = computeFlexBasis(percent);
         const startPx = basisToPx(basis.start, containerSize);
         const endPx = basisToPx(basis.end, containerSize);

         expect(startPx + endPx + dividerWidth).toBeCloseTo(containerSize, 6);
      }
   });

   test('非法输入退化为 0%，不会产出 NaN 样式', () => {
      expect(computeFlexBasis(Number.NaN).start).toBe('0%');
   });

   test('越界百分比被夹到 [0, 100]', () => {
      expect(computeFlexBasis(-20).start).toBe('0%');
      expect(computeFlexBasis(180).start).toBe('100%');
   });
});

describe('percentFromDrag', () => {
   test('向右拖动按位移换算新的 start 比例', () => {
      // 两侧各 400px（合计 800px），向右拖 40px -> (400 + 40) / 800 = 55%
      expect(
         percentFromDrag({ startSize: 400, endSize: 400, delta: 40 })
      ).toBeCloseTo(55, 6);
   });

   test('向左拖动', () => {
      // 向左拖 80px -> (400 - 80) / 800 = 40%
      expect(
         percentFromDrag({ startSize: 400, endSize: 400, delta: -80 })
      ).toBeCloseTo(40, 6);
   });

   test('任一侧小于最小比例时返回 null（保持上一次有效值）', () => {
      // 拖到 start 侧只剩 8% < 10%
      expect(
         percentFromDrag({ startSize: 400, endSize: 400, delta: -350 })
      ).toBeNull();
      // 反向同理
      expect(
         percentFromDrag({ startSize: 400, endSize: 400, delta: 350 })
      ).toBeNull();
   });

   test('正好等于最小比例时是允许的', () => {
      // (400 - 320) / 800 = 10%
      expect(
         percentFromDrag({ startSize: 400, endSize: 400, delta: -320 })
      ).toBeCloseTo(MIN_PANEL_PERCENT, 6);
   });

   test('容器尺寸为 0 时返回 null，不会产生 Infinity/NaN', () => {
      expect(percentFromDrag({ startSize: 0, endSize: 0, delta: 10 })).toBeNull();
   });
});

describe('percentFromFit（按内容自适应）', () => {
   test('自适应 start 侧：内容宽即面板宽', () => {
      expect(
         percentFromFit({ place: 'start', contentSize: 200, containerSize: 1000 })
      ).toBeCloseTo(20, 6);
   });

   test('自适应 end 侧：还要扣掉分隔条占位', () => {
      // end 面板要 200px 内容 -> start = 100 - (200 + 12) / 1000 * 100 = 78.8
      expect(
         percentFromFit({ place: 'end', contentSize: 200, containerSize: 1000 })
      ).toBeCloseTo(78.8, 6);
   });

   test('自适应结果代入 basis 后，目标侧宽度确实等于内容尺寸', () => {
      const containerSize = 1000;

      const startPercent = percentFromFit({
         place: 'end',
         contentSize: 200,
         containerSize,
      })!;
      const basis = computeFlexBasis(startPercent);
      expect(basisToPx(basis.end, containerSize)).toBeCloseTo(200, 6);

      const startFit = percentFromFit({
         place: 'start',
         contentSize: 320,
         containerSize,
      })!;
      const basis2 = computeFlexBasis(startFit);
      expect(basis2).toBeDefined();
      expect(basisToPx(basis2.start, containerSize)).toBeCloseTo(320, 6);
   });

   test('容器或内容尺寸非法时返回 null', () => {
      expect(
         percentFromFit({ place: 'start', contentSize: 100, containerSize: 0 })
      ).toBeNull();
      expect(
         percentFromFit({ place: 'start', contentSize: 0, containerSize: 1000 })
      ).toBeNull();
      expect(
         percentFromFit({
            place: 'start',
            contentSize: Number.NaN,
            containerSize: 1000,
         })
      ).toBeNull();
   });
});

describe('keyboardDelta', () => {
   test('水平分割：左右方向键', () => {
      expect(keyboardDelta('horizontal', 'ArrowLeft')).toBe(
         -KEYBOARD_STEP_PERCENT
      );
      expect(keyboardDelta('horizontal', 'ArrowRight')).toBe(
         KEYBOARD_STEP_PERCENT
      );
   });

   test('垂直分割：上下方向键（上=缩小 start）', () => {
      expect(keyboardDelta('vertical', 'ArrowUp')).toBe(-KEYBOARD_STEP_PERCENT);
      expect(keyboardDelta('vertical', 'ArrowDown')).toBe(
         KEYBOARD_STEP_PERCENT
      );
   });

   test('Shift 加速', () => {
      expect(keyboardDelta('horizontal', 'ArrowRight', true)).toBe(
         KEYBOARD_STEP_FAST_PERCENT
      );
   });

   test('方向不匹配或无关按键返回 null', () => {
      expect(keyboardDelta('horizontal', 'ArrowUp')).toBeNull();
      expect(keyboardDelta('vertical', 'ArrowLeft')).toBeNull();
      expect(keyboardDelta('horizontal', 'Enter')).toBeNull();
   });
});

describe('clampPercent', () => {
   test('按给定上下界夹取', () => {
      expect(clampPercent(5, 10, 90)).toBe(10);
      expect(clampPercent(95, 10, 90)).toBe(90);
      expect(clampPercent(42, 10, 90)).toBe(42);
   });

   test('非有限值退化为下界', () => {
      expect(clampPercent(Number.NaN, 10, 90)).toBe(10);
      expect(clampPercent(Number.POSITIVE_INFINITY, 10, 90)).toBe(90);
   });
});
