import { describe, expect, test } from 'vitest';
import { getLevel, getLevelProgress, getLevelScore } from './level';

describe('getLevel', () => {
   test('每个等级的基准分是 50，等级区间为左闭右开', () => {
      // level 1: [0, 50)  level 2: [50, 200)  level 3: [200, 450)
      expect(getLevel(0)).toBe(1);
      expect(getLevel(49)).toBe(1);
      expect(getLevel(50)).toBe(2);
      expect(getLevel(199)).toBe(2);
      expect(getLevel(200)).toBe(3);
      expect(getLevel(449)).toBe(3);
      expect(getLevel(450)).toBe(4);
   });

   test('负数分数视为 1 级', () => {
      expect(getLevel(-100)).toBe(1);
   });
});

describe('getLevelScore', () => {
   test('等级门槛分 = floor(50 * (level - 1) ^ 2)', () => {
      expect(getLevelScore(1)).toBe(0);
      expect(getLevelScore(2)).toBe(50);
      expect(getLevelScore(3)).toBe(200);
      expect(getLevelScore(4)).toBe(450);
   });
});

describe('getLevelProgress', () => {
   test('经验值是等级内已积累量，而不是门槛分本身', () => {
      // score = 120 -> level 2，门槛分 50，下一级门槛分 200
      const progress = getLevelProgress(120);

      expect(progress.level).toBe(2);
      // 当前等级内已积累 120 - 50 = 70（修复前错误地返回 50）
      expect(progress.expInCurrentLevel).toBe(70);
      // 升级所需的经验跨度 200 - 50 = 150
      expect(progress.expToNextLevel).toBe(150);
      expect(progress.expProgress).toBeCloseTo(70 / 150, 10);
   });

   test('进度随分数在等级内单调递增，且始终在 [0, 1) 内', () => {
      for (let score = 0; score <= 500; score++) {
         const { expProgress } = getLevelProgress(score);
         expect(expProgress).toBeGreaterThanOrEqual(0);
         expect(expProgress).toBeLessThan(1);

         // 跨级时进度会重置，只比较同一等级内的相邻分数
         if (score > 0 && getLevel(score - 1) === getLevel(score)) {
            expect(expProgress).toBeGreaterThanOrEqual(
               getLevelProgress(score - 1).expProgress
            );
         }
      }
   });

   test('刚好达到等级门槛分时，当前等级经验为 0', () => {
      const progress = getLevelProgress(200);

      expect(progress.level).toBe(3);
      expect(progress.expInCurrentLevel).toBe(0);
      expect(progress.expToNextLevel).toBe(250);
      expect(progress.expProgress).toBe(0);
   });

   test('0 分与负分不会产生负经验', () => {
      expect(getLevelProgress(0).expInCurrentLevel).toBe(0);
      expect(getLevelProgress(-10).expInCurrentLevel).toBe(0);
   });
});
