import z from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import prisma from '~~/lib/prisma';
import { projectService } from '../../services/project';
import { observer } from '../../services/achievement';
import { router } from '../../trpc';
import { TRPCError } from '@trpc/server';

// 获取或创建项目
const GetOrForkProjectSchema = z.object({
   problemId: z.number('Project ID must be a number'),
});

const getOrForkProjectProcedure = protectedProcedure
   .input(GetOrForkProjectSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const project = await prisma.projects.findFirst({
         where: {
            ownerId: userId,
            problemId: input.problemId,
            isTemplate: false,
         },
         include: {
            FileSystem: {
               include: {
                  files: true,
               },
            },
         },
      });
      if (project) {
         return project;
      }

      const [templateProject, previousProject] = await Promise.all([
         prisma.projects.findFirstOrThrow({
            where: {
               problemId: input.problemId,
               isTemplate: true,
            },
            select: { pid: true },
         }),
         // 同一道基础题在其他版本上的作答工程（取最新版本）
         prisma.projects.findFirst({
            where: {
               ownerId: userId,
               isTemplate: false,
               problemId: { not: input.problemId },
               problem: {
                  BaseProblem: {
                     ProblemVersions: { some: { pid: input.problemId } },
                  },
               },
            },
            orderBy: { problemId: 'desc' },
            select: { pid: true, problemId: true },
         }),
      ]);

      // 新版本没改作答模板时沿用用户已有的作答文件，否则从新模板开始
      let sourceProjectId = templateProject.pid;
      if (previousProject) {
         const [currentTemplate, previousTemplate] = await Promise.all([
            projectService.getTemplateFiles(input.problemId),
            projectService.getTemplateFiles(previousProject.problemId),
         ]);
         if (projectService.isSameFiles(currentTemplate, previousTemplate)) {
            sourceProjectId = previousProject.pid;
         }
      }

      const { projectId } = await projectService.fork({
         projectId: sourceProjectId,
         problemId: input.problemId,
         isTemplate: false,
         userId: userId,
      });

      const result = await prisma.projects.findUniqueOrThrow({
         where: {
            pid: projectId,
         },
         include: {
            FileSystem: {
               include: {
                  files: true,
               },
            },
         },
      });
      return result;
   });

// 获取问题详情
const GetProblemDetailSchema = z.object({
   problemId: z.number('Problem ID must be a number'),
});

const getProblemDetailProcedure = protectedProcedure
   .input(GetProblemDetailSchema)
   .query(async ({ input }) => {
      const problem = await prisma.problems.findUnique({
         where: {
            pid: input.problemId,
            isDeprecated: false,
         },
         include: {
            CoverImage: {
               select: { name: true },
            },
            ProblemDefaultCover: {
               select: { image: { select: { name: true } } },
               take: 1,
            },
            SnapshotImage: {
               select: {
                  id: true,
                  name: true,
                  status: true,
                  fileName: true,
                  formatVersion: true,
                  sizeBytes: true,
               },
            },
         },
      });
      if (!problem) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Problem not found',
         });
      }
      // 服务端状态判定：未发布（含发布后被取消发布）的题目一律按不存在处理，
      // 防止通过 URL 直达继续作答。与 NOT_FOUND 同错误码，避免暴露题目存在性。
      if (problem.status !== 'published') {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Problem not found',
         });
      }
      const imageName =
         problem.CoverImage?.name ??
         problem.ProblemDefaultCover?.[0]?.image.name ??
         null;
      return { ...problem, coverImageName: imageName };
   });

// 提交答案
const CommitAnswerSchema = z.object({
   problemId: z.number('Problem ID must be a number'),
   snapshot: z.record(z.string(), z.string(), 'Invalid snapshot format'),
});

const commitAnswerProcedure = protectedProcedure
   .input(CommitAnswerSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { judge } = useRuntimeConfig();

      const { judgeRecordId, judgeScript } = await prisma.$transaction(
         async (tx) => {
            // 创建判题记录
            const { id: judgeRecordId } = await tx.judgeRecords.create({
               data: {
                  type: 'judge',
                  problemId: input.problemId,
                  userId: userId,
                  info: {},
               },
               select: {
                  id: true,
               },
            });

            const { JudgeFile, status } = await tx.problems.findUniqueOrThrow({
               where: {
                  pid: input.problemId,
               },
               select: {
                  JudgeFile: {
                     select: {
                        judgeScript: true,
                     },
                  },
                  status: true,
               },
            });
            // 未发布（含被取消发布）的题目不允许提交判题；在事务内抛错会一并回滚上面创建的判题记录
            if (status !== 'published') {
               throw new TRPCError({
                  code: 'NOT_FOUND',
                  message: 'Problem not found',
               });
            }

            return { judgeRecordId, judgeScript: JudgeFile[0]!.judgeScript };
         },
      );

      // 事务已提交，再派发判题任务：调度器收到任务会立刻查库，事务未提交时会因查不到判题记录直接失败
      await fetch(`${judge.serverUrl}/task/create`, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'x-trace-id': ctx.traceId ?? '',
         },
         body: JSON.stringify({
            userId: userId,
            judgeRecordId: judgeRecordId,
            judgeScript: judgeScript,
            fsSnapshot: input.snapshot,
            problemId: input.problemId,
            mode: 'judge',
         }),
      }).then((res: any) => {
         if (!res.ok) {
            throw new TRPCError({
               code: 'INTERNAL_SERVER_ERROR',
               message: `Failed to create task: ${res.message}`,
            });
         }
      });

      return {
         success: true,
         judgeRecordId,
      };
   });

// 获取所有提交记录
const GetAllCommitRecordsSchema = z.object({
   problemId: z.number('Problem ID must be a number'),
});

const getAllCommitRecordsProcedure = protectedProcedure
   .input(GetAllCommitRecordsSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      // 提交记录按基础题汇总，题目发新版本后历史提交仍可见
      const records = await prisma.judgeRecords.findMany({
         where: {
            userId: userId,
            type: 'judge',
            problem: {
               BaseProblem: {
                  ProblemVersions: { some: { pid: input.problemId } },
               },
            },
         },
         select: {
            id: true,
            result: true,
            createdAt: true,
         },
         orderBy: {
            createdAt: 'desc',
         },
      });
      return records;
   });

// 获取详情
const GetCommitRecordDetailSchema = z.object({
   judgeRecordId: z.number('Judge Record ID must be a number'),
});

const getCommitRecordDetailProcedure = protectedProcedure
   .input(GetCommitRecordDetailSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const record = await prisma.judgeRecords.findFirst({
         where: {
            id: input.judgeRecordId,
            userId: userId,
         },
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

const GetCurrentProblemPidSchema = z.object({
   problemId: z.number('Problem ID must be a number'),
});

const getCurrentProblemPidProcedure = protectedProcedure
   .input(GetCurrentProblemPidSchema)
   .query(async ({ input }) => {
      const problem = await prisma.problems.findUnique({
         where: { pid: input.problemId },
         select: {
            pid: true,
            BaseProblem: {
               select: { currentPid: true },
            },
         },
      });
      if (!problem) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Problem not found',
         });
      }
      // 母题没有当前版本（被删除置空）时，回退为该题目自身的 pid
      return { pid: problem.BaseProblem?.currentPid ?? problem.pid };
   });

// 获取当前用户的做题状态：completed 为已通过的题目 pid，attempted 为提交过但未通过的题目 pid，
// 均按基础题归并到当前版本 pid
const listProblemStatusesProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      const records = await prisma.judgeRecords.findMany({
         where: {
            userId,
            type: 'judge',
         },
         select: {
            result: true,
            problem: {
               select: {
                  pid: true,
                  BaseProblem: { select: { currentPid: true } },
               },
            },
         },
      });

      // pid -> 是否通过过判题
      const statuses = new Map<number, boolean>();
      for (const record of records) {
         const success = record.result === 'success';
         const mark = (pid: number) =>
            statuses.set(pid, (statuses.get(pid) ?? false) || success);
         mark(record.problem.pid);
         const currentPid = record.problem.BaseProblem?.currentPid;
         if (currentPid !== null && currentPid !== undefined) mark(currentPid);
      }

      const completed: number[] = [];
      const attempted: number[] = [];
      for (const [pid, success] of statuses) {
         (success ? completed : attempted).push(pid);
      }
      return { completed, attempted };
   },
);

// 获取提交统计
const getCommitStatisticProcedure = protectedProcedure.query(
   async ({ ctx }) => {
      const { userId } = ctx.user;

      return await prisma.userStatistic.findUnique({
         where: { userId },
         select: {
            correctRate: true,
            passCount: true,
            score: true,
         },
      });
   },
);

// 重置用户项目：删除用户 fork 项目的全部虚拟文件，再从模板项目复制一份干净的
const ResetProjectSchema = z.object({
   problemId: z.number('Problem ID must be a number'),
});

const resetProjectProcedure = protectedProcedure
   .input(ResetProjectSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      await prisma.$transaction(async (tx) => {
         const userProject = await tx.projects.findFirst({
            where: {
               ownerId: userId,
               problemId: input.problemId,
               isTemplate: false,
            },
            select: { pid: true },
         });
         // 没有 fork 过说明还没动过题目，无需重置
         if (!userProject) {
            return;
         }
         // 锁定项目行：串行化同一项目的并发重置，并保证后到的事务能看到前一个事务提交的插入，避免复制出同路径的重复文件
         await tx.$queryRaw`SELECT pid FROM projects WHERE pid = ${userProject.pid} FOR UPDATE`;
         const templateProject = await tx.projects.findFirstOrThrow({
            where: {
               problemId: input.problemId,
               isTemplate: true,
            },
            select: { pid: true },
         });

         await tx.virtualFiles.deleteMany({
            where: {
               FileSystem: { projectId: userProject.pid },
            },
         });
         await tx.$executeRaw`
            INSERT INTO "virtual_files" (vid, path, content, "ownerId", "fileSystemFsid", "createdAt", "updatedAt")
            SELECT
               gen_random_uuid() AS vid,
               path,
               content,
               ${userId},
               (
                  SELECT fsid FROM "file_systems" WHERE "projectId" = ${userProject.pid}
               ),
               NOW(),
               NOW()
            FROM "virtual_files"
            WHERE "fileSystemFsid" = (
               SELECT fsid FROM "file_systems" WHERE "projectId" = ${templateProject.pid}
            )
         `;
         // 递增版本号，使携带旧版本号的文件同步请求（重置前发出）被服务端拒绝
         await tx.$executeRaw`
            UPDATE projects SET revision = revision + 1, "updatedAt" = NOW() WHERE pid = ${userProject.pid}
         `;
      });
      observer.manualMarkDirty(['projects', 'file_systems', 'virtual_files']);

      return { success: true };
   });

export const problemRouter = router({
   getOrForkProject: getOrForkProjectProcedure,
   getProblemDetail: getProblemDetailProcedure,
   getCurrentProblemPid: getCurrentProblemPidProcedure,
   commitAnswer: commitAnswerProcedure,
   getAllCommitRecords: getAllCommitRecordsProcedure,
   getCommitRecordDetail: getCommitRecordDetailProcedure,
   getCommitStatistic: getCommitStatisticProcedure,
   listProblemStatuses: listProblemStatusesProcedure,
   resetProject: resetProjectProcedure,
});
