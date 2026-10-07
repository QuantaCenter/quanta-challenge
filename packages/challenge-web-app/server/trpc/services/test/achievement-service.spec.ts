import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * 成就服务层（server/trpc/services/achievement.ts）的单元测试。
 *
 * 观察者（AchievementObserver）本身已由 achievement-observer.spec.ts 覆盖，
 * 但**真正决定"发不发分"的两块逻辑此前零覆盖**：
 *
 *   1. `observer.addListener('check', ...)` —— 进度落库 + 达成时给用户加分；
 *   2. `hasCircularDependency` —— 前置成就成环检测（成环会让成就永远无法达成）。
 *
 * 这里把两层依赖分别 mock：
 *   · `@challenge/database` —— 观察者内部直接使用原生 PrismaClient；
 *   · `~~/lib/prisma`      —— 服务层监听器使用的（带 tracker 包装的）客户端。
 */
const mocks = vi.hoisted(() => {
   const tx = {
      userAchievement: { upsert: vi.fn() },
      user: { update: vi.fn() },
   };

   return {
      tx,
      // 服务层导入的 prisma（~~/lib/prisma 的 default）
      servicePrisma: {
         $transaction: vi.fn(),
         achievementPreAchievement: { findMany: vi.fn() },
      },
      // 依赖追踪器：observe() 只要求能 subscribe
      tracker: { subscribe: vi.fn() },
      // 观察者导入的 prisma（@challenge/database 的 default）
      //
      // 注意：achievement.ts 在**模块加载时**就构造了单例观察者，其构造器会
      // fire-and-forget 调用 rebuildDepTree() -> prisma.achievement.findMany()。
      // 因此这里的默认实现必须在 hoisted 阶段就给出（否则模块加载即抛
      // "Cannot read properties of undefined (reading 'forEach')" 的 unhandled rejection）。
      db: {
         $queryRawUnsafe: vi.fn().mockResolvedValue([]),
         achievement: {
            findUnique: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
         },
         userAchievement: { findUnique: vi.fn().mockResolvedValue(null) },
         achievementPreAchievement: { findMany: vi.fn().mockResolvedValue([]) },
      },
      logger: { info: vi.fn(), error: vi.fn() },
   };
});

vi.mock('~~/lib/prisma', () => ({
   default: mocks.servicePrisma,
   tracker: mocks.tracker,
}));

vi.mock('@challenge/database', () => ({
   default: mocks.db,
}));

vi.mock('~~/lib/logger', () => ({
   logger: mocks.logger,
}));

vi.mock('../context', () => ({
   requestContext: { getStore: () => undefined },
}));

// 服务层注册的 vars injector 会调用 Nuxt 自动导入的 useRedis()。
// 本文件的用例都不带依赖数据加载器，因此不会走到那里；仍然给个兜底，
// 免得将来加了 loader 用例时报 "useRedis is not defined"。
vi.stubGlobal('useRedis', () => ({ get: vi.fn().mockResolvedValue(null) }));

import { achievementService } from '../achievement';
import { DEFAULT_ACHIEVEMENTS } from '../../../../scripts/achievement-seed-data';

/**
 * 成环检测是 achievement.ts 的内部函数，只通过 achievementService 暴露
 * （文件里并没有把它单独 export 出去）。
 */
const hasCircularDependency = achievementService.hasCircularDependency;

/** 触发一次成就判定，并等待 'check' 监听器（fire-and-forget）落地 */
const trigger = async (achievementId: number, userId?: string) => {
   const result = await achievementService.observer.triggerCheckAchievement(
      achievementId,
      userId
   );
   // 监听器由 EventEmitter 同步调用，但内部是 async：等一个宏任务让它跑完
   await new Promise((resolve) => setTimeout(resolve, 0));
   return result;
};

beforeEach(() => {
   vi.clearAllMocks();

   mocks.tracker.subscribe.mockReturnValue(() => {});
   mocks.tx.userAchievement.upsert.mockResolvedValue({});
   mocks.tx.user.update.mockResolvedValue({});
   mocks.servicePrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(mocks.tx)
   );

   // 观察者默认状态：用户没有该成就、没有前置成就
   mocks.db.achievement.findMany.mockResolvedValue([]);
   mocks.db.userAchievement.findUnique.mockResolvedValue(null);
   mocks.db.achievementPreAchievement.findMany.mockResolvedValue([]);
   mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([]);
});

describe('hasCircularDependency（前置成就成环检测）', () => {
   test('没有任何前置关系时不成环', async () => {
      mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([]);

      await expect(hasCircularDependency(1, [])).resolves.toBe(false);
   });

   test('把自己设为自己的前置时成环', async () => {
      mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([]);

      await expect(hasCircularDependency(1, [1])).resolves.toBe(true);
   });

   test('两个成就互为前置时成环', async () => {
      // 库里已有 2 -> 1，现在要把 2 设为 1 的前置（1 -> 2）
      mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([
         { achievementId: 2, preAchievementId: 1 },
      ]);

      await expect(hasCircularDependency(1, [2])).resolves.toBe(true);
   });

   test('长链路回环也能识别（1 -> 2 -> 3 -> 1）', async () => {
      mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([
         { achievementId: 2, preAchievementId: 3 },
         { achievementId: 3, preAchievementId: 1 },
      ]);

      await expect(hasCircularDependency(1, [2])).resolves.toBe(true);
   });

   test('普通链式依赖（3 依赖 2 依赖 1）不算环', async () => {
      mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([
         { achievementId: 2, preAchievementId: 1 },
      ]);

      await expect(hasCircularDependency(3, [2])).resolves.toBe(false);
   });

   test('菱形依赖（两条路径汇合到同一前置）不算环', async () => {
      mocks.servicePrisma.achievementPreAchievement.findMany.mockResolvedValue([
         { achievementId: 2, preAchievementId: 1 },
         { achievementId: 3, preAchievementId: 1 },
      ]);

      await expect(hasCircularDependency(4, [2, 3])).resolves.toBe(false);
   });
});

describe('check 事件监听器（成就发放）', () => {
   const mockAchievement = (script: string, score = 0) => ({
      AchievementValidateScript: { script },
      AchievementDependencyData: [],
      score,
   });

   test('达成时：进度写 1，并按成就分值给用户加分', async () => {
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: true, progress: 1 })',
            50
         )
      );

      await trigger(7, 'user-1');

      expect(mocks.servicePrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mocks.tx.userAchievement.upsert).toHaveBeenCalledWith({
         where: {
            userId_achievementId: { achievementId: 7, userId: 'user-1' },
         },
         create: {
            progress: 1,
            achievement: { connect: { id: 7 } },
            user: { connect: { id: 'user-1' } },
         },
         update: { progress: 1, achievedAt: expect.any(Date) },
      });
      expect(mocks.tx.user.update).toHaveBeenCalledWith({
         where: { id: 'user-1' },
         data: { score: { increment: 50 } },
      });
   });

   test('未达成时：只更新进度，**不**加分', async () => {
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: false, progress: 0.4 })',
            50
         )
      );

      await trigger(7, 'user-1');

      expect(mocks.tx.userAchievement.upsert).toHaveBeenCalledWith(
         expect.objectContaining({
            update: { progress: 0.4, achievedAt: expect.any(Date) },
         })
      );
      // 关键断言：没达成就不许动用户分数
      expect(mocks.tx.user.update).not.toHaveBeenCalled();
   });

   test('进度超过 1 会被裁剪到 1（未达成时也不加分）', async () => {
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: false, progress: 1.5 })',
            50
         )
      );

      await trigger(7, 'user-1');

      expect(mocks.tx.userAchievement.upsert).toHaveBeenCalledWith(
         expect.objectContaining({
            update: expect.objectContaining({ progress: 1 }),
         })
      );
      expect(mocks.tx.user.update).not.toHaveBeenCalled();
   });

   test('没有 userId（未登录）时完全不落库', async () => {
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: true, progress: 1 })',
            50
         )
      );

      await trigger(7);

      expect(mocks.servicePrisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.tx.userAchievement.upsert).not.toHaveBeenCalled();
      expect(mocks.tx.user.update).not.toHaveBeenCalled();
   });

   test('事务失败只记日志、不向外抛出（不能拖垮判题结果处理）', async () => {
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: true, progress: 1 })',
            50
         )
      );
      mocks.servicePrisma.$transaction.mockRejectedValue(
         new Error('deadlock detected')
      );

      await expect(trigger(7, 'user-1')).resolves.toStrictEqual({
         achieved: true,
         progress: 1,
         score: 50,
      });

      expect(mocks.logger.error).toHaveBeenCalledWith(
         '[Observer:check] Error awarding achievement:',
         expect.any(Error)
      );
   });

   test('未达成的成就被再次触发时不会重复加分', async () => {
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: true, progress: 1 })',
            30
         )
      );
      // 用户已有该成就且进度已满 —— 观察者应当直接短路返回 false
      mocks.db.userAchievement.findUnique.mockResolvedValue({ progress: 1 });

      const result = await trigger(7, 'user-1');

      expect(result).toBe(false);
      expect(mocks.servicePrisma.$transaction).not.toHaveBeenCalled();
      expect(mocks.tx.user.update).not.toHaveBeenCalled();
   });

   test('前置成就未达成时跳过检测', async () => {
      mocks.db.userAchievement.findUnique.mockResolvedValue(null);
      mocks.db.achievementPreAchievement.findMany.mockResolvedValue([
         {
            preAchievement: {
               UserAchievement: [{ progress: 0.5 }],
            },
         },
      ]);

      const result = await trigger(7, 'user-1');

      expect(result).toBe(false);
      expect(mocks.db.achievement.findUnique).not.toHaveBeenCalled();
      expect(mocks.servicePrisma.$transaction).not.toHaveBeenCalled();
   });

   test('前置成就全部达成后继续检测并发放', async () => {
      mocks.db.userAchievement.findUnique.mockResolvedValue(null);
      mocks.db.achievementPreAchievement.findMany.mockResolvedValue([
         { preAchievement: { UserAchievement: [{ progress: 1 }] } },
      ]);
      mocks.db.achievement.findUnique.mockResolvedValue(
         mockAchievement(
            'export default (depData) => ({ achieved: true, progress: 1 })',
            20
         )
      );

      const result = await trigger(7, 'user-1');

      expect(result).toStrictEqual({ achieved: true, progress: 1, score: 20 });
      expect(mocks.tx.user.update).toHaveBeenCalledWith({
         where: { id: 'user-1' },
         data: { score: { increment: 20 } },
      });
   });
});

/**
 * 判题完成路径：Nitro 的 server-to-server webhook（api/webhooks/judge-complete）
 * **没有 tRPC 请求上下文**，所以 `requestContext.getStore()` 是空的。
 *
 * 这条路径过去完全无法判定成就：
 *   · 观察者靠 `_useUserId()` 取 userId -> undefined；
 *   · 应用注册的 vars injector 也会返回 `{ userId: undefined }`，把调用方显式传入的
 *     userId 直接覆盖掉（Object.assign 的语义）；
 *   · 结果要么 SQL 报 `missing FROM-clause entry for table "__ctx"`，
 *     要么发分监听器因为 userId 为空而直接 return。
 *
 * 这里用真实的种子定义（「首战告捷」）来锁定修复后的行为。
 */
describe('判题完成路径（无请求上下文）的成就判定', () => {
   const def = DEFAULT_ACHIEVEMENTS.find((a) => a.name === '首战告捷')!;
   const loader = def.loaders[0]!;

   const mockAchievementDetail = () => {
      mocks.db.achievement.findUnique.mockResolvedValue({
         AchievementValidateScript: { script: def.script },
         AchievementDependencyData: [
            {
               achievementDepDataLoader: {
                  id: 1,
                  name: loader.name,
                  type: loader.type,
                  sql: loader.sql,
                  isList: loader.isList,
               },
            },
         ],
         score: def.score,
      });
   };

   /** 依赖树由 rebuildDepTree 构建：把判题记录注册到 judge_records 上 */
   const mockDepTree = async () => {
      mocks.db.achievement.findMany.mockResolvedValue([
         {
            id: 1,
            AchievementDependencyData: [
               { achievementDepDataLoader: { id: 1, sql: loader.sql } },
            ],
         },
      ]);
      await achievementService.observer.rebuildDepTree();
   };

   test('manualMarkDirty 带上的 userId 会注入到 __ctx，且给对应用户加分', async () => {
      await mockDepTree();
      mockAchievementDetail();
      mocks.db.$queryRawUnsafe.mockResolvedValue([{ value: 1005 }]);

      // 完全模拟 webhook：没有请求上下文，只能通过 injectVars 带人
      achievementService.observer.manualMarkDirty(['judge_records'], {
         userId: 'user-1',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const executedSql = mocks.db.$queryRawUnsafe.mock.calls[0]?.[0] as string;
      expect(executedSql).toContain('WITH __ctx AS (');
      expect(executedSql).toContain(`'user-1' AS userId`);
      // 找不到 __ctx.userId 的话这里根本不会走到加分
      expect(mocks.tx.user.update).toHaveBeenCalledWith({
         where: { id: 'user-1' },
         data: { score: { increment: def.score } },
      });
   });

   test('注入器返回的 undefined 不会覆盖调用方显式传入的 userId', async () => {
      await mockDepTree();
      mockAchievementDetail();
      mocks.db.$queryRawUnsafe.mockResolvedValue([{ value: 1005 }]);

      achievementService.observer.manualMarkDirty('judge_records', {
         userId: 'user-1',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const executedSql = mocks.db.$queryRawUnsafe.mock.calls[0]?.[0] as string;
      // 应用注册的 injector 此刻返回的是 { userId: undefined, continuesCheckinCount: 0 }
      expect(executedSql).toContain(`'user-1' AS userId`);
      expect(executedSql).not.toContain('undefined');
   });

   test('没有 userId 时不会误判成"所有人"（加载器不执行）', async () => {
      await mockDepTree();
      mockAchievementDetail();

      achievementService.observer.manualMarkDirty('judge_records');
      await new Promise((resolve) => setTimeout(resolve, 0));

      // __ctx.userId 注入不到 -> SQL 必然失败，不该产生任何加分
      expect(mocks.tx.user.update).not.toHaveBeenCalled();
      expect(mocks.tx.userAchievement.upsert).not.toHaveBeenCalled();
   });
});
