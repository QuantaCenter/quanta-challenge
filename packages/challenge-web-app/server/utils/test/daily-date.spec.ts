import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
   DAILY_TIMEZONE,
   fromDailyDate,
   getDailyDateKey,
   isValidDateKey,
   previousDateKey,
   secondsUntilDailyCacheExpiry,
   secondsUntilNextDailyDay,
   toDailyDate,
} from '../daily-date';

/**
 * daily-date 是每日一题时区事故的修复核心：把「业务日期」从容器本地时区
 * （线上是 UTC）里解耦出来。这里的用例钉死两点：
 *   · 北京时间 00:00–08:00 必须算作「当天」，不能退回 UTC 的前一天；
 *   · 落库/查询统一用 UTC 零点，保证 date 唯一索引能精确命中。
 */
describe('每日一题业务日期工具', () => {
   beforeAll(() => vi.useFakeTimers());
   afterAll(() => vi.useRealTimers());

   it('北京时间 00:00–08:00 也按当天计算，而不是 UTC 的前一天', () => {
      // 2026-10-08 00:30 CST == 2026-10-07 16:30 UTC
      vi.setSystemTime(new Date('2026-10-07T16:30:00Z'));
      expect(DAILY_TIMEZONE).toBe('Asia/Shanghai');
      expect(getDailyDateKey()).toBe('2026-10-08');
   });

   it('北京时间白天时与 UTC 日期一致', () => {
      vi.setSystemTime(new Date('2026-10-08T02:00:00Z')); // 10:00 CST
      expect(getDailyDateKey()).toBe('2026-10-08');
   });

   it('把业务日期归一化成 UTC 零点（与部署环境 TZ 无关）', () => {
      expect(toDailyDate('2026-10-08').toISOString()).toBe(
         '2026-10-08T00:00:00.000Z',
      );
   });

   it('读回时间戳能还原成同一业务日期键', () => {
      expect(fromDailyDate(toDailyDate('2026-10-08'))).toBe('2026-10-08');
   });

   it('缓存过期点是业务日次日 01:00，而不是当天 01:00', () => {
      vi.setSystemTime(new Date('2026-10-07T16:30:00Z')); // 10-08 00:30 CST
      // 到 10-09 01:00 CST 还有 24.5 小时（旧实现会算出 -23.5 小时）
      expect(secondsUntilDailyCacheExpiry('2026-10-08')).toBe(24.5 * 3600);
      // 到 10-09 00:00 CST 还有 23.5 小时
      expect(secondsUntilNextDailyDay('2026-10-08')).toBe(23.5 * 3600);
   });

   it('拒绝会被 dayjs 宽松滚动的伪日期', () => {
      expect(isValidDateKey('2026-10-08')).toBe(true);
      expect(isValidDateKey('2026-99-99')).toBe(false);
      expect(isValidDateKey('2026-02-30')).toBe(false);
      expect(isValidDateKey('20261008')).toBe(false);
   });

   it('previousDateKey 跨月正确', () => {
      expect(previousDateKey('2026-11-01')).toBe('2026-10-31');
   });
});
