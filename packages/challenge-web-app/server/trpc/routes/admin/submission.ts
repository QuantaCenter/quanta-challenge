import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';

const SubmissionListSchema = z.object({
  /** 匹配用户名 / 昵称 */
  userKeyword: z.string().trim().max(50).optional(),
  /** 匹配题目标题 / pid */
  problemKeyword: z.string().trim().max(50).optional(),
  /** 判题结果，不传为全部 */
  result: z.enum(['pending', 'success', 'failed']).optional(),
  /** 提交时间范围（闭区间） */
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

/** 最近提交列表：type='judge'（audit 是审核记录，不算提交），按提交时间倒序 + id 兜底排序。 */
const getAllSubmissionsProcedure = protectedAdminProcedure
  // prefault 而不是 default：不传参时把 {} 交给 schema 正常解析出各字段默认值（同 user.ts）
  .input(SubmissionListSchema.prefault({}))
  .query(async ({ input }) => {
    const { userKeyword, problemKeyword, result, startTime, endTime, page, pageSize } =
      input;

    const where: Prisma.JudgeRecordsWhereInput = {
      type: 'judge',
      ...(result ? { result } : {}),
      ...(startTime || endTime
        ? {
            createdAt: {
              ...(startTime ? { gte: startTime } : {}),
              ...(endTime ? { lte: endTime } : {}),
            },
          }
        : {}),
      ...(userKeyword
        ? {
            user: {
              OR: [
                { name: { contains: userKeyword, mode: 'insensitive' } },
                { displayName: { contains: userKeyword, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
      ...(problemKeyword
        ? {
            problem: {
              OR: [
                { title: { contains: problemKeyword, mode: 'insensitive' as const } },
                ...(isNaN(Number(problemKeyword))
                  ? []
                  : [{ pid: Number(problemKeyword) }]),
              ],
            },
          }
        : {}),
    };

    const [total, submissions] = await Promise.all([
      prisma.judgeRecords.count({ where }),
      prisma.judgeRecords.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          result: true,
          score: true,
          judgingTime: true,
          pendingTime: true,
          createdAt: true,
          problem: {
            select: {
              pid: true,
              title: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              avatar: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      submissions: submissions.map((submission) => ({
        ...submission,
        avatarUrl: submission.user.avatar?.name
          ? `/api/static/${submission.user.avatar.name}`
          : null,
      })),
      total,
      page,
      pageSize,
    };
  });

const SubmissionDetailSchema = z.object({
  judgeRecordId: z.number().int(),
});

/** 提交详情：管理端不限 userId，可查看任意用户的判题记录。 */
const getSubmissionDetailProcedure = protectedAdminProcedure
  .input(SubmissionDetailSchema)
  .query(async ({ input }) => {
    const record = await prisma.judgeRecords.findUnique({
      where: { id: input.judgeRecordId },
      select: {
        id: true,
        result: true,
        info: true,
        judgingTime: true,
        score: true,
        pendingTime: true,
        createdAt: true,
        problem: {
          select: {
            pid: true,
            title: true,
          },
        },
        user: {
          select: {
            name: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });
    if (!record) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Record not found',
      });
    }
    return record;
  });

export const submissionRouter = router({
  getAllSubmissions: getAllSubmissionsProcedure,
  getSubmissionDetail: getSubmissionDetailProcedure,
});
