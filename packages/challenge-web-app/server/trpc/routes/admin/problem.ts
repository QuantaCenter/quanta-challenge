import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { ReuploadSchema, UploadSchema } from '../../schemas/publish-schema';
import { router } from '../../trpc';
import { IFile, projectService } from '../../services/project';
import z from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { DefaultArgs } from '@prisma/client/runtime/library';
import { useStore } from '../../store';
import { generateThumbhashFromBuffer } from '@challenge/shared/thumbhash/server';
import { renderThumbhashDataUrls } from '~~/server/utils/thumbhash';
import { TRPCError } from '@trpc/server';

type TX = Omit<
   PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
   '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const handleCreateVersion = async (options: {
   tx: TX;
   input: z.infer<typeof UploadSchema>;
   userId: string;
   baseProblemId: number;
   judgeScript: string;
   judgeServerUrl: string;
   traceId: string;
}) => {
   const {
      tx,
      input,
      userId,
      baseProblemId,
      judgeScript,
      judgeServerUrl,
      traceId,
   } = options;
   // 创建问题版本
   const problem = await tx.problems.create({
      data: {
         baseId: baseProblemId,
         title: input.title,
         detail: input.detail,
         difficulty: input.difficulty,
         totalScore: input.totalScore,
         status: 'draft',
         coverImageId: input.coverImageId,
         bootCommand: input.bootCommand,
         initCommand: input.initCommand,
         buildCommand: input.buildCommand,
         judgeUploadPath: input.judgeUploadPath,
         enableCloudFunction: input.enableCloudFunction ?? false,
         tags: {
            connect: input.tagIds.map((id) => ({
               tid: id,
            })),
         },
         JudgeFile: {
            create: { judgeScript },
         },
         JudgeStatus: {
            create: {},
         },
      },
      select: {
         pid: true,
      },
   });
   const problemId = problem.pid;

   // 更新基础问题的版本PID
   await tx.baseProblems.update({
      where: { id: baseProblemId },
      data: {
         currentPid: problemId,
      },
   });

   // 创建模板工程
   const fs = Object.entries(input.answerTemplateSnapshot).map(
      ([path, content]) =>
         ({
            name: path.split('/').pop() || 'unknown',
            path,
            content,
         }) satisfies IFile,
   );
   await projectService.create({
      fs: fs,
      tx: tx,
      problemId: problem.pid,
      isTemplate: true,
      userId: userId,
   });

   // 创建判题记录
   const templateJudgeRecord = await tx.templateJudgeRecords.create({
      data: {
         problem: {
            connect: {
               pid: problem.pid,
            },
         },
         judgeRecord: {
            create: {
               type: 'audit',
               problemId: problem.pid,
               userId: userId,
               info: {},
            },
         },
      },
      select: {
         judgeRecordId: true,
      },
   });

   // 发送任务到任务处理服务
   await fetch(`${judgeServerUrl}/task/create`, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'x-trace-id': traceId,
      },
      body: JSON.stringify({
         userId: userId,
         problemId: problemId,
         judgeRecordId: templateJudgeRecord.judgeRecordId,
         judgeScript: judgeScript,
         fsSnapshot: input.referenceAnswerSnapshot,
         mode: 'audit',
      }),
   }).then((res: any) => {
      if (!res.ok) {
         throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: `Failed to create task: ${res.message}`,
         });
      }
   });

   return problemId;
};

// 上传新问题及其详细信息、判题脚本和答题模板。
const uploadProcedure = protectedAdminProcedure
   .input(UploadSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { judge } = useRuntimeConfig();

      const { code: judgeScript } = await fetch(
         `${judge.serverUrl}/code/extract`,
         {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'x-trace-id': ctx.traceId ?? '',
            },
            body: JSON.stringify({
               code: input.judgeScript,
            }),
         },
      ).then((res) => res.json());
      if (!judgeScript || typeof judgeScript !== 'string') {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Judge script must export a default function',
         });
      }

      // 如果有封面图片，计算其 thumbhash
      if (input.coverImageId) {
         const { name } = await prisma.image.findUniqueOrThrow({
            where: { id: input.coverImageId },
            select: { name: true },
         });
         const store = useStore();
         const buffer = await store.getBuffer(name);
         if (!buffer) {
            throw new TRPCError({
               code: 'BAD_REQUEST',
               message: 'Cover image not found in storage',
            });
         }
         const hash = await generateThumbhashFromBuffer(buffer);
         await prisma.image.update({
            where: { id: input.coverImageId },
            data: { thumbhash: hash },
         });
      }

      let problemId: number | undefined;
      await prisma.$transaction(async (tx) => {
         // 创建问题
         const baseProblem = await tx.baseProblems.create({
            data: { authorId: userId },
         });
         // 创建问题版本
         problemId = await handleCreateVersion({
            tx,
            input,
            userId,
            baseProblemId: baseProblem.id,
            judgeScript,
            judgeServerUrl: judge.serverUrl,
            traceId: ctx.traceId ?? '',
         });
      });

      return {
         message: 'Problem created and task queued successfully',
         problemId,
      };
   });

// 获取问题的详细信息，包括标题、分数、状态、难度等。
const GetProblemDetailsSchema = z.object({
   problemId: z.number('Problem ID must be a number').int(),
});

const getAuditDetailProcedure = protectedAdminProcedure
   .input(GetProblemDetailsSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId } = input;

      const result = await prisma.problems.findUniqueOrThrow({
         where: {
            pid: problemId,
         },
         select: {
            pid: true,
            title: true,
            totalScore: true,
            status: true,
            difficulty: true,
            createdAt: true,
            tags: {
               select: {
                  name: true,
                  color: true,
               },
            },
            CoverImage: {
               select: {
                  name: true,
                  id: true,
               },
            },
            TemplateJudgeRecord: {
               include: {
                  judgeRecord: true,
               },
            },
            ProblemDefaultCover: {
               include: {
                  image: {
                     select: {
                        id: true,
                        name: true,
                     },
                  },
               },
            },
            JudgeFile: {
               select: {
                  judgeScript: true,
               },
            },
            BaseProblem: {
               select: {
                  id: true,
                  currentPid: true,
               },
            },
         },
      });

      const templateJudgeRecord = result.TemplateJudgeRecord[0]?.judgeRecord;
      if (!templateJudgeRecord) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No template judge record found for this problem',
         });
      }
      if (templateJudgeRecord.userId !== userId) {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this problem',
         });
      }

      const defaultCover = result.ProblemDefaultCover[0]?.image;

      return {
         ...result,
         imageName: result.CoverImage?.name || defaultCover?.name,
      };
   });

// 设置问题的发布状态。
const SetStatusSchema = z.object({
   problemId: z.number('Problem ID must be a number').int(),
   publish: z.boolean('Publish must be a boolean'),
});

const setStatusProcedure = protectedAdminProcedure
   .input(SetStatusSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId, publish } = input;

      const problem = await prisma.problems.findUniqueOrThrow({
         where: {
            pid: problemId,
            BaseProblem: {
               authorId: userId,
            },
         },
         select: {
            status: true,
            BaseProblem: {
               select: {
                  currentPid: true,
               },
            },
         },
      });

      if (
         problem.BaseProblem.currentPid &&
         problem.BaseProblem.currentPid !== problemId
      ) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
               'Cannot change publish status of a problem that is not the current version',
         });
      }

      if (!['ready', 'published'].includes(problem.status)) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
               'Only problems with status "ready" or "published" can change publish status',
         });
      }

      const newStatus = publish ? 'published' : 'ready';

      await prisma.problems.update({
         where: {
            pid: problemId,
         },
         data: {
            status: newStatus,
         },
      });

      return { message: `Problem is now ${newStatus}` };
   });

// 获取当前用户上传的所有问题。
const ListUploadsSchema = z.object({
   tids: z.array(
      z
         .number()
         .int()
         .nonnegative()
         .min(1, 'Tag ID must be a positive integer'),
   ),
});

const listProcedure = protectedAdminProcedure
   .input(ListUploadsSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      const filter =
         input.tids.length > 0
            ? {
                 CurrentProblem: {
                    tags: {
                       some: { tid: { in: input.tids } },
                    },
                 },
              }
            : {};

      const baseProblems = await prisma.baseProblems.findMany({
         where: {
            authorId: userId,
            currentPid: { not: null },
            ...filter,
         },
         select: {
            updatedAt: true,
            CurrentProblem: {
               select: {
                  pid: true,
                  title: true,
                  difficulty: true,
                  createdAt: true,
                  status: true,
                  tags: {
                     select: {
                        name: true,
                        color: true,
                     },
                  },
                  CoverImage: {
                     select: {
                        name: true,
                        id: true,
                        thumbhash: true,
                     },
                  },
                  ProblemDefaultCover: {
                     select: {
                        image: {
                           select: {
                              id: true,
                              name: true,
                              thumbhash: true,
                           },
                        },
                     },
                  },
               },
            },
         },
         orderBy: {
            updatedAt: 'desc',
         },
      });

      const rawProblems = baseProblems
         .map((base) => base.CurrentProblem)
         .filter((problem) => problem !== null)
         .map((problem) => ({
            ...problem,
            imageName:
               problem.CoverImage?.name ||
               problem.ProblemDefaultCover[0]?.image.name,
            imageHash:
               problem.CoverImage?.thumbhash ||
               problem.ProblemDefaultCover[0]?.image.thumbhash,
         }));

      // 服务端带缓存地把 thumbhash 渲染为 data URL，供 SSR 首帧直接使用
      const imageThumbhashUrls = await renderThumbhashDataUrls(
         rawProblems.map((problem) => problem.imageHash),
      );
      return rawProblems.map((problem, index) => ({
         ...problem,
         imageThumbhashUrl: imageThumbhashUrls[index],
      }));
   });

// 获取问题的详细信息，用于重新发布
const GetDetailSchema = z.object({
   problemId: z.number('Problem ID must be a number').int(),
});

const getDetailProcedure = protectedAdminProcedure
   .input(GetDetailSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId } = input;

      const problem = await prisma.problems.findUniqueOrThrow({
         where: {
            pid: problemId,
            BaseProblem: {
               authorId: userId,
            },
         },
         select: {
            title: true,
            detail: true,
            difficulty: true,
            totalScore: true,
            status: true,
            createdAt: true,
            // 这四个字段原先没有 select —— 于是"编辑/重新发布"页拿不到值，
            // 界面上显示为空；而提交时会原样回传，等于把库里的值清空（数据丢失）。
            bootCommand: true,
            initCommand: true,
            buildCommand: true,
            judgeUploadPath: true,
            enableCloudFunction: true,
            tags: {
               select: {
                  tid: true,
               },
            },
            BaseProblem: {
               select: {
                  id: true,
               },
            },
            CoverImage: {
               select: {
                  name: true,
                  id: true,
               },
            },
            Project: {
               where: {
                  isTemplate: true,
               },
               select: {
                  FileSystem: {
                     select: {
                        fsid: true,
                        files: {
                           select: {
                              path: true,
                              content: true,
                           },
                        },
                     },
                  },
               },
            },
            JudgeFile: {
               select: {
                  judgeScript: true,
               },
            },
         },
      });

      return problem;
   });

// 创建一个新的模板工程
// 注意：ReuploadSchema 定义在 schemas/publish-schema.ts 里，与 UploadSchema 共用同一套
// 跨字段校验（extend 不继承 refine，写在这里会让重新发布绕过"参考答案必填"等校验）。
const reuploadProcedure = protectedAdminProcedure
   .input(ReuploadSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { baseId } = input;
      const { judge } = useRuntimeConfig();

      // 检查问题是否存在且属于当前用户
      const { currentPid } = await prisma.baseProblems.findUniqueOrThrow({
         where: {
            id: baseId,
            authorId: userId,
         },
         select: {
            currentPid: true,
         },
      });

      // 转化判题脚本
      const { code: judgeScript } = await fetch(
         `${judge.serverUrl}/code/extract`,
         {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'x-trace-id': ctx.traceId ?? '',
            },
            body: JSON.stringify({
               code: input.judgeScript,
            }),
         },
      ).then((res) => res.json());
      if (!judgeScript || typeof judgeScript !== 'string') {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Judge script must export a default function',
         });
      }

      // 创建新问题版本
      let problemId: number | undefined;
      await prisma.$transaction(async (tx) => {
         problemId = await handleCreateVersion({
            tx,
            input,
            userId,
            baseProblemId: baseId,
            judgeScript,
            judgeServerUrl: judge.serverUrl,
            traceId: ctx.traceId ?? '',
         });
         if (currentPid) {
            await tx.problemVersionTransitions.create({
               data: {
                  baseProblemId: baseId,
                  fromId: currentPid,
                  toId: problemId,
                  changeByType: 'user',
                  changeByUserId: userId,
               },
            });
         }
      });

      return {
         message: 'Problem re-uploaded successfully',
         problemId,
      };
   });

// 获取所有版本
const GetProblemVersionsSchema = z.object({
   problemId: z.number('Problem ID must be a number').int(),
});

const getVersionsProcedure = protectedAdminProcedure
   .input(GetProblemVersionsSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId } = input;

      const problem = await prisma.problems.findUniqueOrThrow({
         where: {
            pid: problemId,
            BaseProblem: {
               authorId: userId,
            },
         },
         select: {
            baseId: true,
            BaseProblem: {
               select: {
                  currentPid: true,
               },
            },
         },
      });

      const versions = await prisma.problems.findMany({
         where: {
            baseId: problem.baseId,
         },
         select: {
            pid: true,
            title: true,
            status: true,
            createdAt: true,
         },
         orderBy: {
            createdAt: 'desc',
         },
      });

      return {
         versions,
         currentPid: problem.BaseProblem.currentPid!,
      };
   });

// 设置当前版本
const SetCurrentProblemSchema = z.object({
   problemId: z.number('Problem ID must be a number').int(),
});

const setCurrentProblemProcedure = protectedAdminProcedure
   .input(SetCurrentProblemSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { problemId } = input;

      await prisma.problems.update({
         where: {
            pid: problemId,
            BaseProblem: {
               authorId: userId,
            },
         },
         data: {
            BaseProblem: {
               update: {
                  currentPid: problemId,
               },
            },
         },
      });

      return { message: 'ok' };
   });

export const problemRouter = router({
   upload: uploadProcedure,
   reupload: reuploadProcedure,
   getAuditDetail: getAuditDetailProcedure,
   getDetail: getDetailProcedure,
   getVersions: getVersionsProcedure,
   setStatus: setStatusProcedure,
   setCurrentProblem: setCurrentProblemProcedure,
   list: listProcedure,
});
