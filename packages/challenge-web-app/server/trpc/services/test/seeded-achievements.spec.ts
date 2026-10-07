import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * 针对**已发布的基础成就**（scripts/achievement-seed-data.ts）的验证。
 *
 * 为什么单独一个文件：种子里的成就不是"写进库就算完"——它们的加载器 SQL 与判定脚本
 * 必须真的能被成就观察者执行。历史上踩过、且静态校验抓不到的坑：
 *
 *   · `__ctx` 是观察者拼在前面的 CTE（`WITH __ctx AS (SELECT ...)`），
 *     Postgres 里 CTE 的列**只有出现在 FROM 中才能引用**；只写在 WHERE 里会报
 *     `missing FROM-clause entry for table "__ctx"`，而 node-sql-parser 的 columnList
 *     照样放行 —— 也就是说坏 SQL 能存进库，只有跑起来才炸。见下面的 `__ctx` 守卫测试。
 *   · 结果列必须别名为 `value`；聚合函数会被 SQL 校验拒绝，必须返回行列表再取 length。
 *   · 判定脚本必须 return `{ achieved, progress }`，否则一律判为未达成。
 */
const mocks = vi.hoisted(() => ({
   db: {
      $queryRawUnsafe: vi.fn(),
      achievement: {
         findMany: vi.fn().mockResolvedValue([]),
         findUnique: vi.fn().mockResolvedValue(null),
      },
      userAchievement: { findUnique: vi.fn().mockResolvedValue(null) },
      achievementPreAchievement: { findMany: vi.fn().mockResolvedValue([]) },
   },
}));

vi.mock('@challenge/database', () => ({ default: mocks.db }));

vi.mock('~~/lib/logger', () => ({
   logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AchievementObserver } from '../utils/achievement-observer';
import {
   DEFAULT_ACHIEVEMENTS,
   type IAchievementSeed,
} from '../../../../scripts/achievement-seed-data';

const byName = (name: string): IAchievementSeed => {
   const found = DEFAULT_ACHIEVEMENTS.find((a) => a.name === name);
   if (!found) throw new Error(`种子中不存在成就：${name}`);
   return found;
};

/** 把种子定义转成观察者 findUnique 期望的形状 */
const toMockAchievement = (def: IAchievementSeed) => ({
   AchievementValidateScript: { script: def.script },
   AchievementDependencyData: def.loaders.map((loader, index) => ({
      achievementDepDataLoader: {
         id: index + 1,
         name: loader.name,
         type: loader.type,
         sql: loader.sql,
         isList: loader.isList,
      },
   })),
   score: def.score,
});

/** 加载器返回 N 行（每行形如 { value: ... }） */
const rowsFor = (count: number) =>
   Array.from({ length: count }, (_, i) => ({ value: i + 1 }));

describe('已发布基础成就的加载器 SQL 守卫', () => {
   test('引用了 __ctx 的加载器，必须把 __ctx 放进 FROM 子句', () => {
      for (const def of DEFAULT_ACHIEVEMENTS) {
         for (const loader of def.loaders) {
            if (!/__ctx\./.test(loader.sql)) continue;

            // 观察者生成的是 `WITH __ctx AS (...) <sql>`：CTE 的列只有出现在 FROM
            // 里才能被引用，只写在 WHERE 里 Postgres 会直接报错。
            const fromClause = /from\s+([\s\S]*?)(where|group|order|limit|$)/i.exec(
               loader.sql
            )?.[1];
            expect(
               fromClause,
               `${def.name} / ${loader.name} 缺少 FROM 子句`
            ).toBeTruthy();
            expect(
               fromClause!.includes('__ctx'),
               `${def.name} / ${loader.name} 引用了 __ctx 但没把它写进 FROM：${loader.sql}`
            ).toBe(true);
         }
      }
   });

   test('每个加载器的 SQL 都能通过观察者的静态校验', async () => {
      const observer = new AchievementObserver(() => null);

      for (const def of DEFAULT_ACHIEVEMENTS) {
         for (const loader of def.loaders) {
            mocks.db.$queryRawUnsafe.mockResolvedValue([]);
            // runQuery 内部会先用 node-sql-parser 校验（限定列名、仅 SELECT），
            // 校验不过会抛 TRPCError —— 这里就是要让它不抛。
            await expect(
               observer.runQuery(`guard_${loader.name}`, loader.sql)
            ).resolves.toEqual([]);
         }
      }
   });

   test('每个加载器都定义了名字/类型/是否列表，且结果列别名为 value', () => {
      for (const def of DEFAULT_ACHIEVEMENTS) {
         expect(def.loaders.length).toBeGreaterThan(0);

         for (const loader of def.loaders) {
            expect(loader.name).toMatch(/^[A-Za-z_]\w*$/);
            expect(['NUMERIC', 'BOOLEAN', 'TEXT']).toContain(loader.type);
            expect(typeof loader.isList).toBe('boolean');
            // 加载器只取一行里的 value 列（见 achievement-observer 的 pickValue）
            expect(loader.sql).toMatch(/as\s+value\b/i);
         }
      }
   });

   test('判定脚本统一使用 export default defineCheckFunc 形式', () => {
      for (const def of DEFAULT_ACHIEVEMENTS) {
         expect(def.script).toMatch(/export default defineCheckFunc\(/);
         expect(def.script).toMatch(/return\s*\{/);
      }
   });
});

describe('已发布基础成就的判定结果', () => {
   let observer: AchievementObserver;

   beforeEach(async () => {
      mocks.db.achievement.findMany.mockResolvedValue([]);
      mocks.db.achievement.findUnique.mockResolvedValue(null);
      mocks.db.userAchievement.findUnique.mockResolvedValue(null);
      mocks.db.achievementPreAchievement.findMany.mockResolvedValue([]);
      observer = new AchievementObserver(() => null);
      await new Promise((resolve) => setTimeout(resolve, 0));
      vi.clearAllMocks();
   });

   const run = async (name: string, loaderRows: number) => {
      const def = byName(name);
      mocks.db.achievement.findUnique.mockResolvedValue(toMockAchievement(def));
      mocks.db.$queryRawUnsafe.mockResolvedValue(rowsFor(loaderRows));
      const result = await observer.triggerCheckAchievement(1, undefined, {
         userId: 'user-1',
      });

      // triggerCheckAchievement 在"已达成/前置未达成"时会短路返回 false；
      // 这些用例的 mock 都不走那两条分支，所以这里显式收窄类型并兜住意外短路。
      if (result === false) {
         throw new Error(`成就「${name}」被意外短路，预期返回判定结果`);
      }
      return result;
   };

   test('初次提交：0 条记录未达成，1 条即达成并拿到 20 分', async () => {
      await expect(run('初次提交', 0)).resolves.toStrictEqual({
         achieved: false,
         progress: 0,
         score: 20,
      });
      await expect(run('初次提交', 1)).resolves.toStrictEqual({
         achieved: true,
         progress: 1,
         score: 20,
      });
   });

   test('首战告捷：没有通过记录时未达成，有 1 条通过即达成', async () => {
      await expect(run('首战告捷', 0)).resolves.toStrictEqual({
         achieved: false,
         progress: 0,
         score: 50,
      });
      await expect(run('首战告捷', 1)).resolves.toStrictEqual({
         achieved: true,
         progress: 1,
         score: 50,
      });
   });

   test('小有所成：2 条通过记录时进度 2/3 且未达成，3 条才达成', async () => {
      const partial = await run('小有所成', 2);
      expect(partial.achieved).toBe(false);
      expect(partial.progress).toBeCloseTo(2 / 3, 6);
      expect(partial.score).toBe(80);

      await expect(run('小有所成', 3)).resolves.toStrictEqual({
         achieved: true,
         progress: 1,
         score: 80,
      });
   });

   test('签到三日：2 天未达成，3 天达成（且是签到成就）', async () => {
      const partial = await run('签到三日', 2);
      expect(partial.achieved).toBe(false);
      expect(partial.progress).toBeCloseTo(2 / 3, 6);

      await expect(run('签到三日', 3)).resolves.toStrictEqual({
         achieved: true,
         progress: 1,
         score: 30,
      });
      expect(byName('签到三日').isCheckinAchievement).toBe(true);
   });

   test('加载器空结果时不会把 NaN 灌进判定脚本', async () => {
      const result = await run('小有所成', 0);
      expect(result).toStrictEqual({ achieved: false, progress: 0, score: 80 });
   });
});
