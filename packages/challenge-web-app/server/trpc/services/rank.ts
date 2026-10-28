import dayjs from 'dayjs';
import { logger } from '~~/server/utils/logger';
import prisma from '~~/lib/prisma';
import { observer } from './achievement';
import type { ValidPath } from '~~/lib/track-wrapper';

/** 只有普通用户参与排行榜（全局榜与单题榜），管理员及以上不计入。 */
const RANKED_ROLE = 'USER' as const;

/** 单题榜 Redis key（v2：统计该题全部已完成的 judge 提交，而非仅 AC） */
const problemRankingsKey = (problemId: number) =>
   `problem:${problemId}:rankings:v2`;

/** 判题分数写入排行榜前规范化：非有限数字视为 0 */
const normalizeJudgeScore = (score: unknown): number => {
   if (score == null) return 0;
   if (
      typeof score === 'object' &&
      'toNumber' in score &&
      typeof (score as { toNumber: () => number }).toNumber === 'function'
   ) {
      const n = (score as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : 0;
   }
   const n = typeof score === 'number' ? score : Number(score);
   return Number.isFinite(n) ? n : 0;
};

const toProblemRankingMemberScore = (
   score: unknown,
   createdAtMs: number,
): number => {
   const normalized = normalizeJudgeScore(score);
   return normalized + (1e10 - (createdAtMs % 1e10)) / 1e12;
};

const problemRankingRecordWhere = (problemId: number) => ({
   problemId,
   type: 'judge' as const,
   result: { not: 'pending' as const },
   user: { role: RANKED_ROLE },
});

const problemRankingRecordWhereByBase = (baseId: number) => ({
   type: 'judge' as const,
   result: { not: 'pending' as const },
   user: { role: RANKED_ROLE },
   problem: { baseId },
});

/** 超越率以数据库为准；统计范围与提交列表一致（同一 base 题下各版本） */
const computeProblemAheadRate = async (
   recordId: number,
): Promise<{ aheadRate: number; total: number } | null> => {
   const myRecord = await prisma.judgeRecords.findFirst({
      where: {
         id: recordId,
         type: 'judge',
         result: { not: 'pending' },
         user: { role: RANKED_ROLE },
      },
      select: {
         score: true,
         problem: { select: { baseId: true } },
      },
   });
   if (!myRecord) return null;

   const myScore = normalizeJudgeScore(myRecord.score);
   const peers = await prisma.judgeRecords.findMany({
      where: problemRankingRecordWhereByBase(myRecord.problem.baseId),
      select: { score: true },
   });
   const total = peers.length;
   if (total <= 1) {
      return { aheadRate: 1, total };
   }

   const maxScore = peers.reduce(
      (max, row) => Math.max(max, normalizeJudgeScore(row.score)),
      0,
   );
   if (myScore >= maxScore) {
      return { aheadRate: 1, total };
   }

   const lowerCount = peers.filter(
      (row) => normalizeJudgeScore(row.score) < myScore,
   ).length;
   return { aheadRate: lowerCount / total, total };
};

/** 将单条记录补写入 Redis（历史失败提交可能从未 push） */
const ensureRecordInProblemRanking = async (
   recordId: number,
): Promise<void> => {
   const row = await prisma.judgeRecords.findFirst({
      where: {
         id: recordId,
         type: 'judge',
         result: { not: 'pending' },
         user: { role: RANKED_ROLE },
      },
      select: {
         id: true,
         problemId: true,
         score: true,
         createdAt: true,
      },
   });
   if (!row) return;

   const recordProblemId = row.problemId;
   const redis = useRedis();
   const rankKey = problemRankingsKey(recordProblemId);
   const recordKey = recordId.toString();
   if ((await redis.zscore(rankKey, recordKey)) !== null) return;

   if (!(await getProblemRankingExistence(recordProblemId))) {
      await loadProblemRankings(recordProblemId);
      return;
   }

   const memberScore = toProblemRankingMemberScore(
      row.score,
      row.createdAt.getTime(),
   );
   await redis.zadd(rankKey, memberScore, recordKey);
};

const isRankedUser = async (userId: string) => {
   const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
   });
   return user?.role === RANKED_ROLE;
};

/**
 * 判断是否存在某题目的排行榜
 */
const getProblemRankingExistence = async (problemId: number) => {
   const redis = useRedis();
   return redis.exists(problemRankingsKey(problemId));
};

/**
 * 载入某题目的排行榜数据
 */
const loadProblemRankings = async (problemId: number) => {
   const redis = useRedis();

   const rankKey = problemRankingsKey(problemId);
   const rankData = await prisma.judgeRecords.findMany({
      where: problemRankingRecordWhere(problemId),
      select: { id: true, score: true, createdAt: true },
   });

   const pipeline = redis.pipeline();
   rankData.forEach(({ id, score, createdAt }) => {
      // 加入时间戳，保证分数相同的情况下后提交的排名更靠后
      const _score = toProblemRankingMemberScore(score, createdAt.getTime());
      pipeline.zadd(rankKey, _score, id);
   });

   const ttl = useRuntimeConfig().rank.problemCacheTTL;
   pipeline.expire(rankKey, ttl ?? 3600);
   await pipeline.exec();
};

/**
 * 将提交的最新得分推入排行榜
 */
const pushToProblemRankings = async (
   problemId: number,
   recordId: number,
   score: number,
   userId: string,
) => {
   if (!(await isRankedUser(userId))) return;
   if (!(await getProblemRankingExistence(problemId))) {
      await loadProblemRankings(problemId);
   }

   const redis = useRedis();
   const rankKey = problemRankingsKey(problemId);
   const _score = toProblemRankingMemberScore(score, Date.now());
   await redis.zadd(rankKey, _score, recordId.toString());
};

const buildScoreIntervalsFromScores = (
   scores: number[],
   n: number,
): { from: number; to: number; count: number }[] => {
   if (scores.length === 0) return [];

   const min = Math.min(...scores);
   const maxExclusive = Math.max(...scores) + 1;
   if (min >= maxExclusive - 1) {
      return [{ from: min, to: min, count: scores.length }];
   }

   const intervalSize = (maxExclusive - min - 1) / n;
   const intervals: { from: number; to: number; count: number }[] = [];
   for (let i = 0; i < n; i++) {
      const from = i === 0 ? min : min + i * intervalSize;
      const to = i === n - 1 ? maxExclusive : min + (i + 1) * intervalSize;
      intervals.push({ from, to, count: 0 });
   }

   for (const score of scores) {
      for (let i = 0; i < intervals.length; i++) {
         const interval = intervals[i]!;
         const isLast = i === intervals.length - 1;
         if (
            score >= interval.from &&
            (isLast ? score <= maxExclusive - 1 : score < interval.to)
         ) {
            interval.count += 1;
            break;
         }
      }
   }

   const lastInterval = intervals[intervals.length - 1];
   if (lastInterval) {
      lastInterval.to = maxExclusive - 1;
   }
   return intervals;
};

const getProblemRankingIntervalsByBase = async (baseId: number, n: number) => {
   const peers = await prisma.judgeRecords.findMany({
      where: problemRankingRecordWhereByBase(baseId),
      select: { score: true },
   });
   const scores = peers.map((row) => normalizeJudgeScore(row.score));
   return buildScoreIntervalsFromScores(scores, n);
};

/**
 * 获取某题目排行榜的分数区间（按 base 题汇总，与超越率口径一致）
 */
const getProblemRankingIntervals = async (problemId: number, n: number) => {
   const problem = await prisma.problems.findUnique({
      where: { pid: problemId },
      select: { baseId: true },
   });
   if (!problem) return [];
   return getProblemRankingIntervalsByBase(problem.baseId, n);
};

/**
 * 获取记录在某题目中的排名
 * @returns
 * - rank: 排名（1-based，同分按提交时间先后，仅作次序展示）
 * - total: 总记录数
 * - aheadRate: 超越率（0~1）：严格低于本条得分的提交占比；与当前最高分同档视为 100%
 */
const getSelfProblemRanking = async (problemId: number, record: number) => {
   if (!(await getProblemRankingExistence(problemId))) {
      await loadProblemRankings(problemId);
   }
   await ensureRecordInProblemRanking(record);

   const aheadFromDb = await computeProblemAheadRate(record);
   const aheadRate = aheadFromDb?.aheadRate ?? 0;
   const total = aheadFromDb?.total ?? 0;

   const redis = useRedis();
   const rankKey = problemRankingsKey(problemId);
   const rank = await redis.zrevrank(rankKey, record.toString());

   if (rank === null) {
      return { rank: -1, total, aheadRate };
   }

   return {
      rank: rank + 1,
      total,
      aheadRate,
   };
};

interface IGlobalRanking {
   userId: string;
   score: number;
}

/**
 * 获取全局排行榜
 * @param limit 获取前多少名
 * @returns
 * - userId: 用户 ID
 */
const getGlobalRankings = async (limit: number = 100) => {
   const redis = useRedis();
   const resultKey = `global:rankings-result:limit-${limit}`;

   const result = await redis.get(resultKey);
   if (result) {
      return JSON.parse(result) as IGlobalRanking[];
   }

   const rankingKey = `global:rankings`;
   const existRanking = await redis.exists(rankingKey);
   if (!existRanking) {
      await loadGlobalRankings();
   }

   const userIdWithScore = await redis.zrevrange(
      rankingKey,
      0,
      limit - 1,
      'WITHSCORES',
   );
   const rankings: IGlobalRanking[] = [];
   for (let i = 0; i < userIdWithScore.length; i += 2) {
      const userId = userIdWithScore[i];
      const score = userIdWithScore[i + 1];
      if (userId === undefined || score === undefined) {
         continue;
      }
      rankings.push({ userId, score: parseFloat(score) });
   }
   await redis.set(resultKey, JSON.stringify(rankings), 'EX', 5 * 60);

   return rankings;
};

/**
 * 按权威公式重算并写入用户的统计数据（分数 / 正确率 / 通过题数）。
 *
 * 公式来自 `packages/database/sql/update-user_statistics.psql`（该文件的定义是权威来源）：
 *   score        = MAX(Σ 各 baseId 上的 MAX(score) − Σ 未撤销的 score_penalties, 0)
 *                  （判题分仅 type='judge' AND result='success'）
 *   passCount    = COUNT(DISTINCT baseId)        （仅成功记录）
 *   correctRate  = 成功记录数 / 全部 judge 记录数 × 100
 *
 * 为什么必须整表重算而不是增量累加：
 * 增量写法需要算出"本次提交让总分涨了多少"，而同一道题重复提交成功并不会加分
 * （取的是 per-baseId 的 MAX）。原实现用 `历史最高分 - 本次得分` 作为增量，
 * 对"每次都拿满分"的题恒等于 0，于是分数永远是 0。
 * 整表重算式天然幂等，重复提交、改分、补判都不会算错。
 *
 * @returns `{ scoreDiff, score }`：分数变化量（用于同步 Redis 排行榜）与重算后的总分
 */
const recalculateUserStatistics = async (
   userId: string,
): Promise<{ scoreDiff: number; score: number }> => {
   const [before] = await prisma.$queryRaw<{ score: number | null }[]>`
      SELECT score FROM user_statistics WHERE "userId" = ${userId}
   `;
   const previousScore = Number(before?.score ?? 0);

   // 与 update-user_statistics.psql 中的 CTE 完全一致
   await prisma.$executeRaw`
      WITH scores AS (
         SELECT "userId", SUM(max_score) AS score
         FROM (
            SELECT judge_records."userId", MAX(judge_records.score) AS max_score
            FROM judge_records
            JOIN problems ON judge_records."problemId" = problems.pid
            WHERE judge_records.type = 'judge' AND judge_records.result = 'success'
            GROUP BY judge_records."userId", problems."baseId"
         ) AS per_problem_max
         GROUP BY "userId"
      ),
      penalties AS (
         SELECT "userId", SUM(score) AS score
         FROM score_penalties
         WHERE "userId" = ${userId} AND "revokedAt" IS NULL
         GROUP BY "userId"
      ),
      passProblemIds AS (
         SELECT judge_records."userId", COUNT(DISTINCT problems."baseId") AS pass_count
         FROM judge_records
         JOIN problems ON judge_records."problemId" = problems.pid
         WHERE judge_records.type = 'judge' AND judge_records.result = 'success'
         GROUP BY judge_records."userId"
      ),
      passRecords AS (
         SELECT judge_records."userId", COUNT(*) AS pass_count
         FROM judge_records
         JOIN problems ON judge_records."problemId" = problems.pid
         WHERE judge_records.type = 'judge' AND judge_records.result = 'success'
         GROUP BY judge_records."userId"
      ),
      allRecords AS (
         SELECT judge_records."userId", COUNT(*) AS total_count
         FROM judge_records
         JOIN problems ON judge_records."problemId" = problems.pid
         WHERE judge_records.type = 'judge'
         GROUP BY judge_records."userId"
      )
      INSERT INTO user_statistics ("userId", score, "correctRate", "passCount", "createdAt", "updatedAt")
      SELECT
         ${userId},
         GREATEST(COALESCE(scores.score, 0) - COALESCE(penalties.score, 0), 0),
         CASE
            WHEN COALESCE(allRecords.total_count, 0) = 0 THEN 0
            ELSE ROUND(COALESCE(passRecords.pass_count, 0)::decimal / allRecords.total_count * 100, 2)
         END,
         COALESCE(passProblemIds.pass_count, 0),
         NOW(),
         NOW()
      FROM (SELECT 1) AS dummy
      LEFT JOIN scores ON scores."userId" = ${userId}
      LEFT JOIN penalties ON penalties."userId" = ${userId}
      LEFT JOIN passProblemIds ON passProblemIds."userId" = ${userId}
      LEFT JOIN passRecords ON passRecords."userId" = ${userId}
      LEFT JOIN allRecords ON allRecords."userId" = ${userId}
      ON CONFLICT ("userId") DO UPDATE SET
         score = EXCLUDED.score,
         "correctRate" = EXCLUDED."correctRate",
         "passCount" = EXCLUDED."passCount",
         "updatedAt" = NOW()
   `;

   const [after] = await prisma.$queryRaw<{ score: number | null }[]>`
      SELECT score FROM user_statistics WHERE "userId" = ${userId}
   `;
   const newScore = Number(after?.score ?? 0);

   observer.manualMarkDirty([
      'user_statistics.correctRate',
      'user_statistics.passCount',
      'user_statistics.score',
   ] as ValidPath[]);

   return { scoreDiff: newScore - previousScore, score: newScore };
};

/**
 * 把用户在全局排行榜（Redis zset）里的分数设为绝对值。
 *
 * 不能用 zincrby 累加：`recalculateUserStatistics` 刚把数据库里的分数改成新值，
 * 若此刻缓存已被清掉，`udpateGlobalRanking` 会先从数据库重载（新值已包含增量）
 * 再 zincrby 加一次，导致重复计分（实测把 40 分算成了 80 分）。
 *
 * 由于 Redis 缓存是"数据库 user_statistics.score 的投影"，
 * 这里统一用 zadd 写绝对值；缓存缺号会由 loadGlobalRankings 兜底补齐。
 */
const setUserGlobalRankingScore = async (userId: string, score: number) => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;

   if (!(await redis.exists(rankingKey))) {
      await loadGlobalRankings();
   }
   if (await isRankedUser(userId)) {
      await redis.zadd(rankingKey, score, userId);
   } else {
      await redis.zrem(rankingKey, userId);
   }
};

/**
 * 抓取一次"今日排名快照"写入 ranking_histories。
 *
 * ## 为什么要在分数变化时抓，而不是只靠定时任务
 *
 * 排名变化卡片读的是 `getMyRankingTrends`，而它唯一的数据源就是 `ranking_history`。
 * 原本只有 `nitro.scheduledTasks` 里那个「每天 0 点」的任务会写这张表，于是：
 *
 * 1. 自建部署下 Nitro 的定时任务未必会被触发（没有外部 cron 时它不会跑），
 *    实测本环境该表只有三条手工遗留数据，rank 恒为 1、score 恒为 0；
 * 2. **更致命的是历史本身**：定时任务只在当天 0 点记录一次，
 *    如果 0 点时用户还没有分数，这一天就永远不会被记录。
 *    Felix 拿到 100 分后反超 admin，但表里根本没有这条变化 ——
 *    排名变化卡片因此永远显示"无变化"。
 *
 * 所以在每次总分变化后补抓一次当天快照：同一天内重复提交只会覆盖当天的记录，
 * 不影响按天比较的语义，而趋势从此能够自愈，不再依赖定时任务是否真的跑了。
 */
const captureRankingSnapshot = async () => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;

   if (!(await redis.exists(rankingKey))) {
      await loadGlobalRankings();
   }

   // 必须用 zrevrange（分数从高到低）。
   //
   // 原实现用 zrange（升序），却把下标直接当名次（rank = i/2 + 1），
   // 于是**分数最低的人拿到第 1 名**，与 getSelfGlobalRanking 使用的 zrevrank
   // （降序）互相矛盾 —— 排名历史里同一时刻的 rank 与 score 对不上，
   // 表现为"排名变化"毫无意义（例如 rank 2 的人分数反而比 rank 1 高）。
   const userScores = await redis.zrevrange(rankingKey, 0, -1, 'WITHSCORES');
   const data: { userId: string; score: number; rank: number }[] = [];
   for (let i = 0; i < userScores.length; i += 2) {
      data.push({
         userId: userScores[i] as string,
         score: parseInt(userScores[i + 1] as string),
         rank: i / 2 + 1,
      });
   }
   if (data.length === 0) return;

   const date = dayjs().startOf('day').toDate();
   // 该表没有 (userId, date) 唯一约束，因此用"先删后建"保证当天幂等，
   // 与 server/tasks/db/update-rank-history.ts 的做法保持一致。
   await prisma.$transaction(async (tx) => {
      await tx.rankingHistory.deleteMany({ where: { date } });
      await tx.rankingHistory.createMany({
         data: data.map(({ userId, score, rank }) => ({ userId, score, rank, date })),
         skipDuplicates: true,
      });
   });
};

/**
 * 获取用户在全局排行榜中的排名
 * @param userId 用户ID
 * @returns
 * - rank: 排名（1-based）
 * - total: 总记录数
 * - score: 分数
 * - aheadRate: 超越率（0~1 之间）
 */
const getSelfGlobalRanking = async (userId: string) => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;

   const existRanking = await redis.exists(rankingKey);
   if (!existRanking) {
      await loadGlobalRankings();
   }

   const [rank, rawScore, total] = await Promise.all([
      redis.zrevrank(rankingKey, userId),
      redis.zscore(rankingKey, userId),
      redis.zcard(rankingKey),
   ]);
   const score = Number(rawScore ?? '0');
   if (rank === null) {
      return { rank: -1, total, aheadRate: 0, score: 0 };
   }

   return {
      rank: rank + 1,
      score,
      total,
      aheadRate: total === 1 ? 1 : (total - rank - 1) / total,
   };
};

/**
 * 载入全局排行榜数据
 */
const loadGlobalRankings = async () => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;
   const rankData = await prisma.userStatistic.findMany({
      where: { score: { gte: 0 }, user: { role: RANKED_ROLE } },
      select: { userId: true, score: true },
   });

   const pipeline = redis.pipeline();
   rankData.forEach(({ userId, score }) => {
      pipeline.zadd(rankingKey, score, userId);
   });

   // EXPIRE 必须排在 ZADD 之后：key 不存在时 EXPIRE 是空操作，ZADD 新建的 key 会永不过期
   const ttl = useRuntimeConfig().rank.problemCacheTTL;
   pipeline.expire(rankingKey, ttl ?? 3600);
   await pipeline.exec();
};

/**
 * 更新全局排行榜
 * @param userId 用户 ID
 * @param scoreDiff 分数变化值
 */
const udpateGlobalRanking = async (userId: string, scoreDiff: number) => {
   if (scoreDiff === 0) return;
   if (!(await isRankedUser(userId))) return;

   const redis = useRedis();
   const rankingKey = `global:rankings`;
   const existRanking = await redis.exists(rankingKey);
   if (!existRanking) {
      await loadGlobalRankings();
   }

   await redis.zincrby(rankingKey, scoreDiff, userId);
};

/** 获取全局排行榜的分数区间
 * @returns
 * - from: 区间下限（包含）
 * - to: 区间上限（不包含）
 * - count: 该分数及以上的用户数
 */
const getGlobalRankingIntervals = async (
   n: number,
): Promise<{ from: number; to: number; count: number }[]> => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;

   const existRanking = await redis.exists(rankingKey);
   if (!existRanking) {
      await loadGlobalRankings();
   }

   const maxScore = await redis.zrevrange(rankingKey, 0, 0, 'WITHSCORES');
   if (maxScore.length < 2) {
      return Array(n).fill({ from: 0, to: 0, count: 0 });
   }

   const max = parseInt(maxScore[1]!) + 1;
   const min = 0;

   const intervalSize = (max - min - 1) / n;
   const intervals: { from: number; to: number; count: number }[] = [];
   for (let i = 0; i < n; i++) {
      const from = i === 0 ? min : min + i * intervalSize;
      const to = i === n - 1 ? max : min + (i + 1) * intervalSize;
      intervals.push({ from, to, count: 0 });
   }

   // 使用 ZCOUNT 获取每个区间的计数
   const pipeline = redis.pipeline();
   intervals.forEach(({ from, to }) => {
      pipeline.zcount(rankingKey, from, to);
   });
   const results = (await pipeline.exec()) as [Error | null, number | null][];

   results.forEach((res, idx) => {
      const interval = intervals[idx];
      if (!interval) {
         return;
      }
      const [err, count] = res;
      if (err) {
         logger.error(err, 'Error fetching rank interval count:');
         interval.count = 0;
      } else {
         interval.count = count as number;
      }
   });

   // 修正最后一个区间的上限
   const lastInterval = intervals[intervals.length - 1];
   if (lastInterval) {
      lastInterval.to = max - 1;
   }
   return intervals;
};

/**
 * 清空所有排行榜缓存（全局榜、单题榜及其结果缓存），下次读取时按当前角色从数据库重建。
 * 成员角色变化后调用：参与资格变了，已缓存的榜单都可能包含/缺少该成员。
 */
const invalidateRankings = async () => {
   const redis = useRedis();
   const keys = ['global:rankings', 'global:rankings:with-userinfo'];
   for (const pattern of ['global:rankings-result:*', 'problem:*:rankings*']) {
      let cursor = '0';
      do {
         const [next, found] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
         cursor = next;
         keys.push(...found);
      } while (cursor !== '0');
   }
   await redis.del(...keys);
};

/** 总分变化后同步统计、排行榜与相关缓存 */
const syncUserScores = async (userIds: string[]) => {
   for (const userId of new Set(userIds)) {
      const { score } = await recalculateUserStatistics(userId);
      await setUserGlobalRankingScore(userId, score);
   }

   const redis = useRedis();
   const keys = ['global:rankings:with-userinfo'];
   let cursor = '0';
   do {
      const [next, found] = await redis.scan(
         cursor,
         'MATCH',
         'global:rankings-result:*',
         'COUNT',
         500,
      );
      cursor = next;
      keys.push(...found);
   } while (cursor !== '0');
   await redis.del(...keys);

   await captureRankingSnapshot().catch((err) => {
      logger.warn({ err, userIds }, 'Failed to capture ranking snapshot');
   });
};

export const rankService = {
   loadProblemRankings,
   pushToProblemRankings,
   getProblemRankingIntervals,
   getSelfProblemRanking,
   getSelfGlobalRanking,
   getProblemRankingExistence,
   getGlobalRankings,
   udpateGlobalRanking,
   loadGlobalRankings,
   getGlobalRankingIntervals,
   recalculateUserStatistics,
   setUserGlobalRankingScore,
   captureRankingSnapshot,
   invalidateRankings,
   syncUserScores,
};
