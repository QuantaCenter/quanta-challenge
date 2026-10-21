import prisma from '~~/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * 按基础题统计通过率（0~1），汇总该题所有版本的提交。
 *
 * 口径与 user_statistics.correctRate 一致：只统计 type='judge' 且已出结果的记录，
 * 不使用按版本累计的 JudgeStatus（它只覆盖单个版本，且包含审核运行）。
 */
const getPassRates = async (baseIds: number[]) => {
   const result = new Map<number, number>();
   const ids = [...new Set(baseIds)];
   if (ids.length === 0) return result;

   const rows = await prisma.$queryRaw<
      { baseId: number; passed: number; total: number }[]
   >`
      SELECT
         problems."baseId" AS "baseId",
         COUNT(*) FILTER (WHERE judge_records.result = 'success')::int AS passed,
         COUNT(*) FILTER (WHERE judge_records.result <> 'pending')::int AS total
      FROM judge_records
      JOIN problems ON judge_records."problemId" = problems.pid
      WHERE judge_records.type = 'judge'
         AND problems."baseId" IN (${Prisma.join(ids)})
      GROUP BY problems."baseId"
   `;
   for (const row of rows) {
      result.set(row.baseId, row.total === 0 ? 0 : row.passed / row.total);
   }
   return result;
};

const getPassRate = async (baseId: number) =>
   (await getPassRates([baseId])).get(baseId) ?? 0;

export const problemStatService = {
   getPassRates,
   getPassRate,
};
