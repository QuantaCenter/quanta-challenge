import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { hashPassword } from '~~/server/utils/password';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure, protectedSuperAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';

/** 「最近提交次数」统计的窗口（天） */
const RECENT_SUBMISSION_DAYS = [7, 30] as const;

const daysAgo = (days: number) => {
   return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

const MemberListSchema = z.object({
   /** 匹配用户名 / 昵称 / 邮箱 */
   keyword: z.string().trim().max(50).optional(),
   role: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']).optional(),
   /** 只支持能直接在数据库排序的字段：活跃时间 / 注册时间 / 分数 */
   sortBy: z.enum(['lastActiveAt', 'createdAt', 'score']).default('lastActiveAt'),
   sortOrder: z.enum(['asc', 'desc']).default('desc'),
   page: z.number().int().min(1).default(1),
   pageSize: z.number().int().min(1).max(100).default(20),
});

/**
 * 成员列表：账号信息 + 活跃情况 + 提交情况。
 *
 * 提交口径与排行榜/统计一致：`judge_records.type = 'judge'`
 * （`audit` 是发布题目时的模板判题，不算用户提交）。
 * 提交计数只针对当前页的用户做 `groupBy`，不随成员总数增长。
 */
const getAllMembersProcedure = protectedAdminProcedure
   // prefault 而不是 default：zod 4 的 default 不会再解析默认值，
   // 传 undefined 时各字段自身的默认值就丢了（page 会变成 undefined）。
   // 用 prefault 把 {} 交给 schema 正常解析；同时允许调用方不传入参——
   // 不传时 tRPC 会把 undefined 交给校验器，缺了这层会直接 400。
   .input(MemberListSchema.prefault({}))
   .query(async ({ input }) => {
      const { keyword, role, sortBy, sortOrder, page, pageSize } = input;

      const where: Prisma.UserWhereInput = {
         ...(role ? { role } : {}),
         ...(keyword
            ? {
                 OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { displayName: { contains: keyword, mode: 'insensitive' } },
                    { email: { contains: keyword, mode: 'insensitive' } },
                 ],
              }
            : {}),
      };

      const orderBy: Prisma.UserOrderByWithRelationInput[] = [
         sortBy === 'score'
            ? { UserStatistic: { score: sortOrder } }
            : sortBy === 'createdAt'
              ? { createdAt: sortOrder }
              : // 从没活跃过的（迁移前的老用户）排在最后
                { lastActiveAt: { sort: sortOrder, nulls: 'last' } },
         // 唯一键兜底：排序键大量重复时（活跃时间全为 NULL、分数同为 0），
         // 数据库不保证同分行的顺序，分页就会出现重复/漏项。
         { id: 'asc' },
      ];

      const [total, users] = await Promise.all([
         prisma.user.count({ where }),
         prisma.user.findMany({
            where,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
               id: true,
               name: true,
               displayName: true,
               role: true,
               createdAt: true,
               lastLogin: true,
               lastActiveAt: true,
               avatar: {
                  select: {
                     name: true,
                  },
               },
               UserStatistic: {
                  select: {
                     score: true,
                     correctRate: true,
                     passCount: true,
                  },
               },
            },
         }),
      ]);

      const userIds = users.map((user) => user.id);
      const [submissionStats, recentStats] = userIds.length
         ? await Promise.all([
              prisma.judgeRecords.groupBy({
                 by: ['userId'],
                 where: { userId: { in: userIds }, type: 'judge' },
                 _count: { _all: true },
                 _max: { createdAt: true },
              }),
              Promise.all(
                 RECENT_SUBMISSION_DAYS.map((days) =>
                    prisma.judgeRecords.groupBy({
                       by: ['userId'],
                       where: {
                          userId: { in: userIds },
                          type: 'judge',
                          createdAt: { gte: daysAgo(days) },
                       },
                       _count: { _all: true },
                    }),
                 ),
              ),
           ])
         : [[], RECENT_SUBMISSION_DAYS.map(() => [])];

      const submissionMap = new Map(
         submissionStats.map((stat) => [
            stat.userId,
            { total: stat._count._all, lastAt: stat._max.createdAt },
         ]),
      );

      const recentMapList = recentStats.map(
         (stats) => new Map(stats.map((stat) => [stat.userId, stat._count._all])),
      );

      const members = users.map((user) => {
         const submission = submissionMap.get(user.id);

         return {
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            role: user.role,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            lastActiveAt: user.lastActiveAt,
            avatarUrl: user.avatar?.name ? `/api/static/${user.avatar.name}` : null,
            submissionCount: submission?.total ?? 0,
            lastSubmissionAt: submission?.lastAt ?? null,
            recentSubmissions: RECENT_SUBMISSION_DAYS.map((days, index) => ({
               days,
               count: recentMapList[index]?.get(user.id) ?? 0,
            })),
            // 没有 user_statistics 行时返回 null：分数/正确率对这类成员是「无数据」，
            // 与真实为 0 分区分开，前端因此能显示 -- 而不是 0.0%
            score: user.UserStatistic?.score ?? null,
            correctRate: user.UserStatistic?.correctRate ?? null,
            passCount: user.UserStatistic?.passCount ?? 0,
         };
      });

      return { members, total, page, pageSize };
   });

const ResetPasswordSchema = z.object({
   userId: z.string().min(1),
   // bcrypt 只取前 72 字节，超长密码后半段等于没生效，所以直接卡住
   newPassword: z.string().min(6, '密码至少 6 位').max(72, '密码最长 72 位'),
});

/**
 * 重置某人的邮箱密码。
 *
 * 权限：超级管理员可重置任何人；普通管理员只能重置 USER（否则管理员能互相接管账号）。
 * 不允许在这里重置自己的密码——那等于绕过了「设置」里改密码的邮箱验证。
 */
const resetPasswordProcedure = protectedAdminProcedure
   .input(ResetPasswordSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId: actorId, role: actorRole } = ctx.user;

      if (input.userId === actorId) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '请到「设置」里修改自己的密码',
         });
      }

      const target = await prisma.user.findUnique({
         where: { id: input.userId },
         select: { id: true, role: true },
      });
      if (!target) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
      }

      if (actorRole !== 'SUPER_ADMIN' && target.role !== 'USER') {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员能重置管理员/超级管理员的密码',
         });
      }

      const auth = await prisma.auth.findFirst({
         where: { userId: input.userId, provider: 'EMAIL' },
         select: { id: true },
      });
      if (!auth) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '该用户没有邮箱密码登录方式，无法重置密码',
         });
      }

      await prisma.auth.update({
         where: { id: auth.id },
         data: { password: await hashPassword(input.newPassword) },
      });

      return { ok: true };
   });

const UpdateRoleSchema = z.object({
   userId: z.string().min(1),
   role: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']),
});

/**
 * 切换成员角色。
 *
 * 权限：仅超级管理员。不允许改自己的角色（否则可能把自己锁在门外）；
 * 由于操作者自身必须仍是 SUPER_ADMIN，超级管理员也不可能被清零。
 * 每次变更写一条 RoleTransition 审计记录（与题目状态流转同一套思路）。
 */
const updateRoleProcedure = protectedSuperAdminProcedure
   .input(UpdateRoleSchema)
   .mutation(async ({ ctx, input }) => {
      const actorId = ctx.user.userId;

      if (input.userId === actorId) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '不能修改自己的权限',
         });
      }

      const target = await prisma.user.findUnique({
         where: { id: input.userId },
         select: { id: true, role: true },
      });
      if (!target) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
      }

      if (target.role === input.role) {
         return { role: target.role };
      }

      await prisma.$transaction([
         prisma.user.update({
            where: { id: input.userId },
            data: { role: input.role },
         }),
         prisma.roleTransition.create({
            data: {
               userId: input.userId,
               fromRole: target.role,
               toRole: input.role,
               changeByType: 'user',
               changeByUserId: actorId,
            },
         }),
      ]);

      return { role: input.role };
   });

export const userRouter = router({
   getAllMembers: getAllMembersProcedure,
   resetPassword: resetPasswordProcedure,
   updateRole: updateRoleProcedure,
});
