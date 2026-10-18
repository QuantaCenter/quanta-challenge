import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/** 每日一题 / 签到的业务时区：显式钉死、不再依赖容器 TZ，可用 DAILY_TIMEZONE 覆盖（默认 Asia/Shanghai）。 */
export const DAILY_TIMEZONE = process.env.DAILY_TIMEZONE || 'Asia/Shanghai';

/** 按业务时区取某时刻所属的「业务日期」（YYYY-MM-DD），不传即今天；只接受 Date/Dayjs 时刻，不接受裸字符串（会被按本地时区解析而偏移）。 */
export const getDailyDateKey = (date: Date | dayjs.Dayjs = dayjs()) =>
   dayjs(date).tz(DAILY_TIMEZONE).format('YYYY-MM-DD');

/** 校验字符串是否是真实存在的 YYYY-MM-DD（dayjs 宽松解析，须回写比对）。 */
export const isValidDateKey = (dateKey: string) =>
   /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
   dayjs.utc(dateKey).format('YYYY-MM-DD') === dateKey;

/** 把业务日期归一化成 UTC 零点的 Date：落库值与部署环境 TZ 无关，查询须用同一函数构造才能命中 date 唯一索引。 */
export const toDailyDate = (dateKey: string) =>
   dayjs.utc(dateKey).startOf('day').toDate();

/** 把落库的 UTC 零点日期还原成业务日期键（必须用 utc() 解析）。 */
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

/** 业务日的缓存过期点：次日 01:00（业务时区）距今的秒数；不能用当天 01:00（可能已过去，EXPIREAT 会立刻删 key）。 */
export const secondsUntilDailyCacheExpiry = (dateKey = getDailyDateKey()) =>
   secondsUntilNextDailyDay(dateKey) + 60 * 60;

/** 业务日期减一天后的 dateKey，用于「连续签到」按业务日比较。 */
export const previousDateKey = (dateKey: string) =>
   dayjs.utc(dateKey).subtract(1, 'day').format('YYYY-MM-DD');
