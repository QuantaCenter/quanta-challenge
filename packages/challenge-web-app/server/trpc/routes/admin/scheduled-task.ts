import { TRPCError } from '@trpc/server';
import z from 'zod';
import dayjs from 'dayjs';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import type { ResetProblemsPayload } from '../../../services/reset-task';
import { dispatchTimerTask } from '../../../utils/timer';

const CreateResetTaskSchema = z.object({
   userNames: z.array(z.string().trim().min(1)).min(1).max(500),
   problemIds: z
      .array(z.number().int())
      .min(1)
      .max(200, '一次最多重置 200 道题'),
   runAt: z.coerce
      .date()
      .refine((date) => dayjs(date).isAfter(dayjs().subtract(1, 'minute')), {
         message: '重置时间必须晚于当前时间',
      }),
});

const createResetTaskProcedure = protectedAdminProcedure
   .input(CreateResetTaskSchema)
   .mutation(async ({ input }) => {
      const { userNames, problemIds, runAt } = input;

      const users = await prisma.user.findMany({
         where: { name: { in: [...new Set(userNames)] } },
         select: { id: true, name: true },
      });
      const found = new Set(users.map((user) => user.name));
      const missing = [...new Set(userNames)].filter(
         (name) => !found.has(name),
      );
      if (missing.length) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `以下用户不存在：${missing.join('、')}`,
         });
      }

      const problems = await prisma.problems.findMany({
         where: { pid: { in: problemIds } },
         select: { pid: true, title: true },
      });
      const missingProblems = problemIds.filter(
         (pid) => !problems.some((problem) => problem.pid === pid),
      );
      if (missingProblems.length) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `以下题目不存在：${missingProblems.join('、')}`,
         });
      }

      const payload: ResetProblemsPayload & {
         userNames: string[];
         problemTitles: string[];
      } = {
         userIds: users.map((user) => user.id),
         problemIds: problems.map((problem) => problem.pid),
         userNames: users.map((user) => user.name),
         problemTitles: problems.map((problem) => problem.title),
      };

      const taskId = await dispatchTimerTask('reset-problems', payload, {
         runAt,
      });

      return { taskId, runAt, userCount: users.length, problemCount: problems.length };
   });

const listProcedure = protectedAdminProcedure.query(async () => {
   const tasks = await prisma.timerTask.findMany({
      where: { handlerId: 'reset-problems' },
      orderBy: { createdAt: 'desc' },
      take: 50,
   });

   return tasks.map((task) => {
      const payload = task.payload as
         | (ResetProblemsPayload & { userNames?: string[]; problemTitles?: string[] })
         | null;
      return {
         id: task.id,
         status: task.status,
         runAt: task.runAt,
         executedAt: task.executedAt,
         attempts: task.attempts,
         error: task.error,
         createdAt: task.createdAt,
         userNames: payload?.userNames ?? [],
         problemTitles: payload?.problemTitles ?? [],
      };
   });
});

/** 任务载荷里冗余的可读信息（创建时写入），用于列表展示 */
type TaskPayloadMeta = {
   userNames?: string[];
   problemTitles?: string[];
   problemId?: number;
   problemTitle?: string;
};

/** 列表标签展示所需的用户补充信息 */
type TaskUserInfo = { displayName: string | null; avatarUrl: string | null };

const buildTaskSummary = (
   handlerId: string,
   payload: TaskPayloadMeta | null,
): string => {
   if (handlerId === 'reset-problems') {
      return `重置 ${payload?.userNames?.length ?? 0} 位用户 · ${payload?.problemTitles?.length ?? 0} 道题目`;
   }
   if (handlerId === 'send-notification') {
      const userCount = payload?.userNames?.length;
      return typeof userCount === 'number'
         ? `定时发送通知 · ${userCount} 位指定用户`
         : '定时发送通知 · 全体用户';
   }
   if (handlerId === 'publish-scheduled-problem') {
      return payload?.problemTitle
         ? `定时发布 · ${payload.problemTitle}`
         : `定时发布 · #${payload?.problemId ?? '?'}`;
   }
   return handlerId;
};

const TaskIdSchema = z.object({ id: z.string().min(1) });

const mapTask = (
   task: {
      id: string;
      handlerId: string;
      status: string;
      runAt: Date;
      executedAt: Date | null;
      attempts: number;
      error: string | null;
      createdAt: Date;
      payload: unknown;
   },
   userInfoByName: Map<string, TaskUserInfo>,
) => {
   const payload = (task.payload as
      | (TaskPayloadMeta & Pick<ResetProblemsPayload, 'problemIds'>)
      | null) ?? null;
   const problemIds = payload?.problemIds ?? [];
   return {
      id: task.id,
      handlerId: task.handlerId,
      status: task.status,
      runAt: task.runAt,
      executedAt: task.executedAt,
      attempts: task.attempts,
      error: task.error,
      createdAt: task.createdAt,
      summary: buildTaskSummary(task.handlerId, payload),
      userNames: payload?.userNames ?? [],
      problemTitles: payload?.problemTitles ?? [],
      /** 标签展示：用户带昵称与头像，题目带题号 */
      users: (payload?.userNames ?? []).map((name) => ({
         name,
         displayName: userInfoByName.get(name)?.displayName ?? null,
         avatarUrl: userInfoByName.get(name)?.avatarUrl ?? null,
      })),
      problems: (payload?.problemTitles ?? []).map((title, index) => ({
         pid: problemIds[index] ?? 0,
         title,
      })),
   };
};

/** 全量任务列表（管理页），可按状态筛选 */
const listAllProcedure = protectedAdminProcedure
   .input(
      z.object({
         status: z
            .enum(['pending', 'running', 'done', 'failed'])
            .optional(),
      }),
   )
   .query(async ({ input }) => {
      const tasks = await prisma.timerTask.findMany({
         where: input.status ? { status: input.status } : {},
         orderBy: { createdAt: 'desc' },
         take: 100,
      });

      // 汇总所有载荷中的用户名，批量补充昵称与头像供标签展示
      const allUserNames = [
         ...new Set(
            tasks.flatMap(
               (task) =>
                  ((task.payload as TaskPayloadMeta | null)?.userNames ?? []),
            ),
         ),
      ];
      const users = allUserNames.length
         ? await prisma.user.findMany({
              where: { name: { in: allUserNames } },
              select: {
                 name: true,
                 displayName: true,
                 avatar: { select: { name: true } },
              },
           })
         : [];
      const userInfoByName = new Map<string, TaskUserInfo>(
         users.map((user) => [
            user.name,
            {
               displayName: user.displayName,
               avatarUrl: user.avatar?.name
                  ? `/api/static/${user.avatar.name}`
                  : null,
            },
         ]),
      );

      return tasks.map((task) => mapTask(task, userInfoByName));
   });

/** 取消待执行任务：直接删除记录，到期后 Worker 不会再拉取 */
const cancelProcedure = protectedAdminProcedure
   .input(TaskIdSchema)
   .mutation(async ({ input }) => {
      const task = await prisma.timerTask.findUnique({
         where: { id: input.id },
         select: { status: true, handlerId: true, payload: true },
      });
      if (!task || task.status !== 'pending') {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '任务不存在或已不在待执行状态',
         });
      }
      // 定时发布任务是「应用状态 + 队列」双写，取消队列时需同步清空题目的定时标记
      const problemId =
         task.handlerId === 'publish-scheduled-problem'
            ? (task.payload as TaskPayloadMeta | null)?.problemId
            : undefined;
      await prisma.$transaction([
         prisma.timerTask.delete({ where: { id: input.id } }),
         ...(typeof problemId === 'number'
            ? [
                 prisma.problems.updateMany({
                    where: { pid: problemId },
                    data: { scheduledPublishAt: null },
                 }),
              ]
            : []),
      ]);
      return { ok: true };
   });

/** 重试失败任务：回到待执行队列并立即到期 */
const retryProcedure = protectedAdminProcedure
   .input(TaskIdSchema)
   .mutation(async ({ input }) => {
      const result = await prisma.timerTask.updateMany({
         where: { id: input.id, status: 'failed' },
         data: { status: 'pending', runAt: dayjs().toDate(), error: null },
      });
      if (result.count === 0) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '任务不存在或不是失败状态',
         });
      }
      return { ok: true };
   });

/** 删除历史任务记录（已完成/失败），不影响执行中的任务 */
const removeProcedure = protectedAdminProcedure
   .input(TaskIdSchema)
   .mutation(async ({ input }) => {
      const result = await prisma.timerTask.deleteMany({
         where: { id: input.id, status: { in: ['done', 'failed'] } },
      });
      if (result.count === 0) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '任务不存在或仍在执行中',
         });
      }
      return { ok: true };
   });

export const scheduledTaskAdminRouter = router({
   createResetTask: createResetTaskProcedure,
   list: listProcedure,
   listAll: listAllProcedure,
   cancel: cancelProcedure,
   retry: retryProcedure,
   remove: removeProcedure,
});
