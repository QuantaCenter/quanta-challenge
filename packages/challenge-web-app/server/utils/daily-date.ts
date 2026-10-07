import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 每日一题 / 每日签到的业务时区。
 *
 * 事故根因：Web 容器默认跑在 UTC，而用户（前端）按本地时区 CST 计算「今天」。
 * 北京时间 00:00–08:00 期间两者的日历日期相差一天，服务端会把用户眼里的今天
 * 判成「未来日期」，于是 selectDailyProblem() 根本不会被调用，当天的每日一题
 * 永远抽不出来。这里显式钉死业务时区，不再依赖容器 TZ。
 *
 * 可通过环境变量 DAILY_TIMEZONE 覆盖（默认 Asia/Shanghai）。
 */
export const DAILY_TIMEZONE = process.env.DAILY_TIMEZONE || 'Asia/Shanghai';

/**
 * 按业务时区取某个时刻所属的「业务日期」，返回 YYYY-MM-DD。
 * 不传参时即业务口径的「今天」。
 *
 * 只接受 Date / Dayjs 这类「时刻」，不接受 YYYY-MM-DD 裸字符串——
 * 后者会被 dayjs 按进程本地时区解析成午夜，在极端时区下又会偏移一天。
 */
export const getDailyDateKey = (date: Date | dayjs.Dayjs = dayjs()) =>
   dayjs(date).tz(DAILY_TIMEZONE).format('YYYY-MM-DD');

/**
 * 校验一个字符串是否是真实存在的 YYYY-MM-DD。
 *
 * dayjs 默认是宽松解析（例如 2026-99-99 会被滚成 2034-06-07），所以不能只看
 * 正则，还要回写比对一次。
 */
export const isValidDateKey = (dateKey: string) =>
   /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
   dayjs.utc(dateKey).format('YYYY-MM-DD') === dateKey;

/**
 * 把业务日期 YYYY-MM-DD 归一化成 UTC 零点的 Date。
 *
 * daily_problems.date / daily_checkins.date 是 PostgreSQL TIMESTAMP(3)（无时区），
 * Prisma 以 UTC 序列化写入。统一用「UTC 零点」表示一个业务日期，落库值就与部署
 * 环境的 TZ 无关；查询时也必须用同一函数构造，才能精确命中 date 唯一索引。
 */
export const toDailyDate = (dateKey: string) =>
   dayjs.utc(dateKey).startOf('day').toDate();

/**
 * 把落库的 UTC 零点日期还原成业务日期键 YYYY-MM-DD。
 * Prisma 读回的 TIMESTAMP 会被当作 UTC，因此必须用 utc() 解析。
 */
export const fromDailyDate = (date: Date) =>
   dayjs.utc(date).format('YYYY-MM-DD');

/** 距离业务日次日 00:00（业务时区）还有多少秒。 */
export const secondsUntilNextDailyDay = (dateKey = getDailyDateKey()) =>
   Math.max(
      1,
      dayjs
         .tz(dateKey, DAILY_TIMEZONE)
         .add(1, 'day')
         .startOf('day')
         .diff(dayjs(), 'second'),
   );

/**
 * 业务日的缓存过期点：次日 01:00（业务时区）距离现在还有多少秒。
 *
 * 原实现用 `dayjs(today).add(1, 'hour')` 得到的是「当天 01:00」——通常已是过去
 * 时间，EXPIREAT 会把 key 立刻删掉，选举因此失去幂等/并发保护。
 */
export const secondsUntilDailyCacheExpiry = (dateKey = getDailyDateKey()) =>
   secondsUntilNextDailyDay(dateKey) + 60 * 60;

/** 业务日期减一天后的 dateKey，用于「连续签到」按业务日比较。 */
export const previousDateKey = (dateKey: string) =>
   dayjs.utc(dateKey).subtract(1, 'day').format('YYYY-MM-DD');
