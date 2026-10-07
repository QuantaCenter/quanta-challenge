import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   createRedisDouble,
   installRedisDouble,
   type RedisDouble,
} from '~~/server/utils/test/redis-double';

/**
 * 每日一题选举的状态机测试。
 *
 * 线上事故的两个直接原因都落在这里：
 *   1. 选举根本没触发（时区在 public 路由处误判「未来日期」）——由 daily-date.spec.ts 覆盖；
 *   2. 选举的 Redis 锁用 setnx + expireat(当天 01:00) 设置，过期点在过去，key 被秒删，
 *      选举失去幂等/并发保护，并发出 500 或唯一键冲突。
 *
 * 这里覆盖第 2 点及落库的健壮性：TTL 必须落在未来、并发只落库一次、
 * P2002 冲突要回退到已有记录。
 */
const mocks = vi.hoisted(() => ({
   prisma: {
      $queryRaw: vi.fn(),
      dailyProblem: {
         create: vi.fn(),
         findUnique: vi.fn(),
      },
      dailyCheckin: {
         findMany: vi.fn(),
      },
   },
}));

vi.mock('~~/lib/prisma', () => ({ default: mocks.prisma }));

import { dailyService } from '../daily';
import { getDailyDateKey, toDailyDate } from '~~/server/utils/daily-date';

const NOW = new Date('2026-10-07T16:30:00Z'); // 北京时间 2026-10-08 00:30

describe('每日一题选举', () => {
   let redis: RedisDouble;

   beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      vi.clearAllMocks();

      const now = { current: Date.now() };
      redis = createRedisDouble(now);
      installRedisDouble(redis, now);
   });

   afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
   });

   const todayDate = () => toDailyDate(getDailyDateKey());
   const cacheKey = () =>
      `daily_problem:${getDailyDateKey().replace(/-/g, '')}`;

   it('首次访问：选出未用过的题目并落库为 UTC 零点', async () => {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 42 }]);
      mocks.prisma.dailyProblem.create.mockResolvedValue({ id: 1 });

      const id = await dailyService.selectDailyProblem();

      expect(id).toBe(42);
      expect(mocks.prisma.dailyProblem.create).toHaveBeenCalledWith({
         data: { date: todayDate(), baseProblemId: 42 },
      });
   });

   it('写入的缓存 TTL 到业务日次日 01:00，而不是被立刻删掉', async () => {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 42 }]);
      mocks.prisma.dailyProblem.create.mockResolvedValue({ id: 1 });

      await dailyService.selectDailyProblem();

      expect(await redis.get(cacheKey())).toBe('42');
      // 现在到 10-09 01:00 CST 还有 24.5 小时
      expect(await redis.ttl(cacheKey())).toBe(24.5 * 3600);

      // 推进到过期点之后，缓存必须消失（验证 TTL 真的生效）
      redis.advanceTime(24.5 * 3600 * 1000 + 1000);
      expect(await redis.get(cacheKey())).toBeNull();
   });

   it('已有缓存时直接返回，不再查库、不再落库', async () => {
      await redis.set(cacheKey(), '99', 'EX', 3600);

      const id = await dailyService.selectDailyProblem();

      expect(id).toBe(99);
      expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
      expect(mocks.prisma.dailyProblem.create).not.toHaveBeenCalled();
   });

   it('并发首次访问只落库一次，两个请求拿到同一题目', async () => {
      mocks.prisma.$queryRaw.mockResolvedValue([{ id: 42 }]);
      mocks.prisma.dailyProblem.create.mockResolvedValue({ id: 1 });

      const [a, b] = await Promise.all([
         dailyService.selectDailyProblem(),
         dailyService.selectDailyProblem(),
      ]);

      expect(a).toBe(42);
      expect(b).toBe(42);
      expect(mocks.prisma.dailyProblem.create).toHaveBeenCalledTimes(1);
   });

   it('落库撞唯一键（P2002）时回退到已有记录，不抛 500', async () => {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 42 }]);
      mocks.prisma.dailyProblem.create.mockRejectedValue({ code: 'P2002' });
      mocks.prisma.dailyProblem.findUnique.mockResolvedValue({
         baseProblemId: 7,
      });

      const id = await dailyService.selectDailyProblem();

      expect(id).toBe(7);
      expect(mocks.prisma.dailyProblem.findUnique).toHaveBeenCalledWith({
         where: { date: todayDate() },
         select: { baseProblemId: true },
      });
   });

   it('非唯一键错误仍然向上抛出，不被吞掉', async () => {
      mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 42 }]);
      mocks.prisma.dailyProblem.create.mockRejectedValue(new Error('db down'));

      await expect(dailyService.selectDailyProblem()).rejects.toThrow('db down');
   });

   it('已发布题全部用过后，兜底按「最久未使用」召回（GROUP BY + MAX(date)）', async () => {
      mocks.prisma.$queryRaw
         .mockResolvedValueOnce([]) // 没有未使用过的题目
         .mockResolvedValueOnce([{ id: 5 }]); // LRU 兜底
      mocks.prisma.dailyProblem.create.mockResolvedValue({ id: 1 });

      const id = await dailyService.selectDailyProblem();

      expect(id).toBe(5);
      const fallbackSql = (
         mocks.prisma.$queryRaw.mock.calls[1][0] as string[]
      ).join('');
      expect(fallbackSql).toContain('GROUP BY');
      expect(fallbackSql).toContain('MAX(dp.date)');
   });
});

describe('连续签到天数', () => {
   beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW); // 北京时间 10-08 00:30
      vi.clearAllMocks();
      const now = { current: Date.now() };
      installRedisDouble(createRedisDouble(now), now);
   });

   afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
   });

   it('从今天或昨天起算，按业务日期连续计数', async () => {
      mocks.prisma.dailyCheckin.findMany.mockResolvedValue([
         { date: toDailyDate('2026-10-08') },
         { date: toDailyDate('2026-10-07') },
         { date: toDailyDate('2026-10-06') },
      ]);

      expect(await dailyService.countContinuesCheckin('u1')).toBe(3);

      // 只统计当月：查询下界应是业务当月的 1 号（UTC 零点）
      expect(mocks.prisma.dailyCheckin.findMany).toHaveBeenCalledWith({
         where: { userId: 'u1', date: { gte: toDailyDate('2026-10-01') } },
         orderBy: { date: 'desc' },
      });
   });

   it('中断的日期不计入连续天数', async () => {
      mocks.prisma.dailyCheckin.findMany.mockResolvedValue([
         { date: toDailyDate('2026-10-08') },
         { date: toDailyDate('2026-10-06') },
      ]);

      expect(await dailyService.countContinuesCheckin('u1')).toBe(1);
   });

   it('最新一次签到早于昨天时，连续天数为 0', async () => {
      mocks.prisma.dailyCheckin.findMany.mockResolvedValue([
         { date: toDailyDate('2026-10-05') },
         { date: toDailyDate('2026-10-04') },
      ]);

      expect(await dailyService.countContinuesCheckin('u1')).toBe(0);
   });
});
