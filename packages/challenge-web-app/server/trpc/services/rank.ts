import dayjs from 'dayjs';
import { logger } from '~~/lib/logger';
import prisma from '~~/lib/prisma';
import { observer } from './achievement';
import type { ValidPath } from '~~/lib/track-wrapper';

/** 判断是否存在某题目的排行榜 */
const getProblemRankingExistence = async (problemId: number) => {
   const redis = useRedis();
   const rankKey = `problem:${problemId}:rankings`;
   return redis.exists(rankKey);
};

/** 载入某题目的排行榜数据 */
const loadProblemRankings = async (problemId: number) => {
   const redis = useRedis();

   const rankKey = `problem:${problemId}:rankings`;
   const rankData = await prisma.judgeRecords.findMany({
      where: {
         problemId,
         type: 'judge',
         score: { gt: 0 },
         result: 'success',
      },
      select: { id: true, score: true, createdAt: true },
   });

   const pipeline = redis.pipeline();
   rankData.forEach(({ id, score, createdAt }) => {
      // 加入时间戳，保证分数相同的情况下后提交的排名更靠后
      const _score = score + (1e10 - (createdAt.getTime() % 1e10)) / 1e12;
      pipeline.zadd(rankKey, _score, id);
   });

   const ttl = useRuntimeConfig().rank.problemCacheTTL;
   pipeline.expire(rankKey, ttl ?? 3600);
   await pipeline.exec();
};

/** 将提交的最新得分推入排行榜 */
const pushToProblemRankings = async (
   problemId: number,
   recordId: number,
   score: number,
) => {
   if (!(await getProblemRankingExistence(problemId))) {
      await loadProblemRankings(problemId);
   }

   const redis = useRedis();
   const rankKey = `problem:${problemId}:rankings`;
   // 加入时间戳，保证分数相同的情况下后提交的排名更靠后
   const _score = score + (1e10 - (Date.now() % 1e10)) / 1e12;
   await redis.zadd(rankKey, _score, recordId.toString());
};

/** 获取某题目排行榜的分数区间（score 分数、count 为该分数及以上的提交数）。 */
const getProblemRankingIntervals = async (problemId: number, n: number) => {
   if (!(await getProblemRankingExistence(problemId))) {
      await loadProblemRankings(problemId);
   }

   const redis = useRedis();
   const rankKey = `problem:${problemId}:rankings`;

   const maxScore = await redis.zrevrange(rankKey, 0, 0, 'WITHSCORES');
   if (maxScore.length < 2) {
      return [];
   }
   const max = parseInt(maxScore[1]) + 1;

   const minScore = await redis.zrange(rankKey, 0, 0, 'WITHSCORES');
   if (minScore.length < 2) {
      return [];
   }
   const min = parseInt(minScore[1]);

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
      pipeline.zcount(rankKey, from, to);
   });
   const results = (await pipeline.exec()) as [Error | null, number | null][];

   results.forEach((res, idx) => {
      const [err, count] = res;
      if (err) {
         logger.error(err, 'Error fetching rank interval count');
         intervals[idx].count = 0;
      } else {
         intervals[idx].count = count as number;
      }
   });

   // 修正最后一个区间的上限
   intervals[intervals.length - 1].to = max - 1;
   return intervals;
};

/** 获取记录在某题目中的排名（1-based）、总记录数与超越率（0~1）。 */
const getSelfProblemRanking = async (problemId: number, record: number) => {
   if (!(await getProblemRankingExistence(problemId))) {
      await loadProblemRankings(problemId);
   }

   const redis = useRedis();
   const rankKey = `problem:${problemId}:rankings`;

   const rank = await redis.zrevrank(rankKey, record.toString());
   const total = await redis.zcard(rankKey);
   if (rank === null) {
      return { rank: -1, total, aheadRate: 0 };
   }

   return {
      rank: rank + 1,
      total,
      aheadRate: (total - rank - 1) / total,
   };
};

interface IGlobalRanking {
   userId: string;
   score: number;
}

/** 获取全局排行榜前 limit 名（userId）。 */
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
      rankings.push({
         userId: userIdWithScore[i],
         score: parseFloat(userIdWithScore[i + 1]),
      });
   }
   await redis.set(resultKey, JSON.stringify(rankings), 'EX', 5 * 60);

   return rankings;
};

/** 按权威公式重算并写入用户统计数据（公式见 packages/database/sql/update-user_statistics.psql）；刻意整表重算而非增量累加（增量对满分题恒为 0，且重算幂等）。 */
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
         COALESCE(scores.score, 0),
         CASE
            WHEN COALESCE(allRecords.total_count, 0) = 0 THEN 0
            ELSE ROUND(COALESCE(passRecords.pass_count, 0)::decimal / allRecords.total_count * 100, 2)
         END,
         COALESCE(passProblemIds.pass_count, 0),
         NOW(),
         NOW()
      FROM (SELECT 1) AS dummy
      LEFT JOIN scores ON scores."userId" = ${userId}
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

/** 把用户在全局排行榜里的分数设为绝对值：Redis 是 DB score 的投影，用 zadd 避免重复计分，缺号由 loadGlobalRankings 兜底补齐。 */
const setUserGlobalRankingScore = async (userId: string, score: number) => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;

   if (!(await redis.exists(rankingKey))) {
      await loadGlobalRankings();
   }
   await redis.zadd(rankingKey, score, userId);
};

/** 抓取一次"今日排名快照"写入 ranking_histories：只在分数变化时抓，因为定时任务不可靠且 0 点无分数的日子永远不会被记录。 */
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

   // 必须用 zrevrange（分数从高到低）。 原实现用 zrange（升序），却把下标直接当名次（rank = i/2 + 1）， 于是**分数最低的人拿到第 1 名**，与 getSelfGlobalRanking 使用的 zrevrank （降序）互相矛盾 —— 排名历史里同一时刻的 rank 与 score 对不上， 表现为"排名变化"毫无意义（例如 rank 2 的人分数反而比 rank 1 高）。
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

/** 获取用户在全局排行榜中的排名（1-based）、总记录数、分数与超越率（0~1）。 */
const getSelfGlobalRanking = async (userId: string) => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;

   const existRanking = await redis.exists(rankingKey);
   if (!existRanking) {
      await loadGlobalRankings();
   }

   const rank = await redis.zrevrank(rankingKey, userId);
   const score = Number((await redis.zscore(rankingKey, userId)) ?? '0');
   const total = await redis.zcard(rankingKey);
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

/** 载入全局排行榜数据 */
const loadGlobalRankings = async () => {
   const redis = useRedis();
   const rankingKey = `global:rankings`;
   const rankData = await prisma.userStatistic.findMany({
      where: { score: { gte: 0 } },
      select: { userId: true, score: true },
   });

   const ttl = useRuntimeConfig().rank.problemCacheTTL;
   const pipeline = redis.pipeline().expire(rankingKey, ttl ?? 3600);

   rankData.forEach(({ userId, score }) => {
      pipeline.zadd(rankingKey, score, userId);
   });

   await pipeline.exec();
};

/** 更新全局排行榜（userId 的分数变化 scoreDiff）。 */
const udpateGlobalRanking = async (userId: string, scoreDiff: number) => {
   if (scoreDiff === 0) return;

   const redis = useRedis();
   const rankingKey = `global:rankings`;
   const existRanking = await redis.exists(rankingKey);
   if (!existRanking) {
      await loadGlobalRankings();
   }

   await redis.zincrby(rankingKey, scoreDiff, userId);
};

/** 获取全局排行榜的分数区间：from 下限（包含）、to 上限（不包含）、count 为该分数及以上的用户数。 */
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

   const max = parseInt(maxScore[1]) + 1;
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
      const [err, count] = res;
      if (err) {
         logger.error(err, 'Error fetching rank interval count:');
         intervals[idx].count = 0;
      } else {
         intervals[idx].count = count as number;
      }
   });

   // 修正最后一个区间的上限
   intervals[intervals.length - 1].to = max - 1;
   return intervals;
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
};
