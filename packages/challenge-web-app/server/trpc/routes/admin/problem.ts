import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import {
   hasEntries,
   REFERENCE_ANSWER_REQUIRED_MESSAGE,
   ReuploadSchema,
   resolveBackendServiceRuntime,
   UploadSchema,
} from '../../schemas/publish-schema';
import { requireCliVersion } from '../../middlewares/require-cli-version';
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

type UploadInput = z.infer<typeof UploadSchema>;

/** 编辑题目时需要重新审核的原因 */
type AuditReason =
   | 'status'
   | 'judgeScript'
   | 'answerTemplate'
   | 'totalScore'
   | 'runtime'
   | 'cover';

/** 版本的运行时配置。后端题的 bootCommand / 镜像 / 云函数由这里收敛（前端题保持原样） */
const resolveVersionRuntime = (input: UploadInput) => {
   const backendRuntime =
      input.problemType === 'backend_service'
         ? resolveBackendServiceRuntime({
              serviceImage: input.serviceImage,
              servicePort: input.servicePort,
              judgeUploadPath: input.judgeUploadPath,
           })
         : undefined;
   return {
      bootCommand: backendRuntime?.bootCommand ?? input.bootCommand,
      initCommand: input.initCommand,
      buildCommand: input.buildCommand,
      judgeUploadPath: input.judgeUploadPath,
      // 后端题：云函数在判题容器里调不通（不签发令牌），强制关掉
      enableCloudFunction:
         backendRuntime?.enableCloudFunction ??
         (input.enableCloudFunction ?? false),
      problemType: input.problemType ?? 'frontend',
      serviceImage: backendRuntime?.serviceImage ?? input.serviceImage,
      servicePort: backendRuntime?.servicePort ?? input.servicePort ?? 3000,
   };
};

/** 提取判题脚本的 default export；同一份脚本多次提取结果一致，可用于比较脚本是否变化 */
const extractJudgeScript = async (options: {
   judgeServerUrl: string;
   traceId: string;
   code: string;
}) => {
   const { code } = await fetch(`${options.judgeServerUrl}/code/extract`, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'x-trace-id': options.traceId,
      },
      body: JSON.stringify({ code: options.code }),
   }).then((res) => res.json());
   return typeof code === 'string' && code ? code : null;
};

/** 自定义封面需要预先计算 thumbhash */
const ensureCoverThumbhash = async (coverImageId?: string) => {
   if (!coverImageId) return;
   const { name } = await prisma.image.findUniqueOrThrow({
      where: { id: coverImageId },
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
      where: { id: coverImageId },
      data: { thumbhash: hash },
   });
};

const handleCreateVersion = async (options: {
   tx: TX;
   input: UploadInput;
   userId: string;
   baseProblemId: number;
   judgeScript: string;
}) => {
   const { tx, input, userId, baseProblemId, judgeScript } = options;
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
         ...resolveVersionRuntime(input),
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

   return { problemId, judgeRecordId: templateJudgeRecord.judgeRecordId };
};

// 审计任务必须在事务提交后派发：调度器收到任务会立刻查库，事务未提交时会因查不到题目行直接失败
const createAuditTask = async (options: {
   judgeServerUrl: string;
   traceId: string;
   userId: string;
   problemId: number;
   judgeRecordId: number;
   judgeScript: string;
   fsSnapshot: UploadInput['referenceAnswerSnapshot'];
}) => {
   const {
      judgeServerUrl,
      traceId,
      userId,
      problemId,
      judgeRecordId,
      judgeScript,
      fsSnapshot,
   } = options;
   await fetch(`${judgeServerUrl}/task/create`, {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'x-trace-id': traceId,
      },
      body: JSON.stringify({
         userId,
         problemId,
         judgeRecordId,
         judgeScript,
         fsSnapshot,
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
};

// 上传新问题及其详细信息、判题脚本和答题模板。
const uploadProcedure = protectedAdminProcedure
   .use(requireCliVersion)
   .input(UploadSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { judge } = useRuntimeConfig();

      const judgeScript = await extractJudgeScript({
         judgeServerUrl: judge.serverUrl,
         traceId: ctx.traceId ?? '',
         code: input.judgeScript,
      });
      if (!judgeScript) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Judge script must export a default function',
         });
      }

      await ensureCoverThumbhash(input.coverImageId);

      const { problemId, judgeRecordId } = await prisma.$transaction(
         async (tx) => {
            // 创建问题
            const baseProblem = await tx.baseProblems.create({
               data: { authorId: userId },
            });
            // 创建问题版本
            return handleCreateVersion({
               tx,
               input,
               userId,
               baseProblemId: baseProblem.id,
               judgeScript,
            });
         },
      );

      await createAuditTask({
         judgeServerUrl: judge.serverUrl,
         traceId: ctx.traceId ?? '',
         userId,
         problemId,
         judgeRecordId,
         judgeScript,
         fsSnapshot: input.referenceAnswerSnapshot,
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
                  authorId: true,
               },
            },
         },
      });

      const templateJudgeRecord = result.TemplateJudgeRecord[0]?.judgeRecord;
      const ownerId = templateJudgeRecord?.userId ?? result.BaseProblem.authorId;
      if (ownerId !== userId) {
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
            problemType: true,
            serviceImage: true,
            servicePort: true,
            tags: {
               select: {
                  tid: true,
               },
            },
            BaseProblem: {
               select: {
                  id: true,
                  currentPid: true,
               },
            },
            CoverImage: {
               select: {
                  name: true,
                  id: true,
               },
            },
            ProblemDefaultCover: {
               select: { imageId: true },
               take: 1,
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

// 创建一个新的模板工程 注意：ReuploadSchema 定义在 schemas/publish-schema.ts 里，与 UploadSchema 共用同一套 跨字段校验（extend 不继承 refine，写在这里会让重新发布绕过"参考答案必填"等校验）。
const reuploadProcedure = protectedAdminProcedure
   .use(requireCliVersion)
   .input(ReuploadSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { baseId } = input;
      const { judge } = useRuntimeConfig();
      const traceId = ctx.traceId ?? '';

      // 检查问题是否存在且属于当前用户
      const { CurrentProblem: current } =
         await prisma.baseProblems.findUniqueOrThrow({
            where: {
               id: baseId,
               authorId: userId,
            },
            select: {
               CurrentProblem: {
                  select: {
                     pid: true,
                     status: true,
                     totalScore: true,
                     bootCommand: true,
                     initCommand: true,
                     buildCommand: true,
                     judgeUploadPath: true,
                     enableCloudFunction: true,
                     problemType: true,
                     serviceImage: true,
                     servicePort: true,
                     JudgeFile: { select: { judgeScript: true }, take: 1 },
                     ProblemDefaultCover: { select: { imageId: true }, take: 1 },
                  },
               },
            },
         });
      const currentPid = current?.pid ?? null;

      // 转化判题脚本；当前版本的脚本也重新提取一遍，用于判断脚本是否变化
      const currentScript = current?.JudgeFile[0]?.judgeScript;
      const [judgeScript, currentJudgeScript, currentTemplateFiles] =
         await Promise.all([
            extractJudgeScript({
               judgeServerUrl: judge.serverUrl,
               traceId,
               code: input.judgeScript,
            }),
            currentScript
               ? extractJudgeScript({
                    judgeServerUrl: judge.serverUrl,
                    traceId,
                    code: currentScript,
                 })
               : null,
            currentPid ? projectService.getTemplateFiles(currentPid) : [],
         ]);
      if (!judgeScript) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Judge script must export a default function',
         });
      }

      await ensureCoverThumbhash(input.coverImageId);

      // 只改了标题、描述、标签、难度、封面时原地更新当前版本，不重新审核；
      // 其余字段会影响判题结果，必须创建新版本并审核
      const auditReasons: AuditReason[] = [];
      if (!current) {
         auditReasons.push('status');
      } else {
         const runtime = resolveVersionRuntime(input);
         const sameText = (a?: string | null, b?: string | null) =>
            (a?.trim() || null) === (b?.trim() || null);
         if (!['ready', 'published'].includes(current.status)) {
            auditReasons.push('status');
         }
         // CLI 传的是源码（提取后应等于库里的值），Web 回传的是库里已提取的代码（再提取后比较）
         if (judgeScript !== currentScript && judgeScript !== currentJudgeScript) {
            auditReasons.push('judgeScript');
         }
         const templateFiles = Object.entries(input.answerTemplateSnapshot).map(
            ([path, content]) => ({ path, content }),
         );
         if (!projectService.isSameFiles(templateFiles, currentTemplateFiles)) {
            auditReasons.push('answerTemplate');
         }
         if (input.totalScore !== current.totalScore) {
            auditReasons.push('totalScore');
         }
         if (
            !sameText(runtime.bootCommand, current.bootCommand) ||
            !sameText(runtime.initCommand, current.initCommand) ||
            !sameText(runtime.buildCommand, current.buildCommand) ||
            !sameText(runtime.judgeUploadPath, current.judgeUploadPath) ||
            !sameText(runtime.serviceImage, current.serviceImage) ||
            runtime.enableCloudFunction !== current.enableCloudFunction ||
            runtime.problemType !== current.problemType ||
            runtime.servicePort !== current.servicePort
         ) {
            auditReasons.push('runtime');
         }
         // 首屏截图封面由审核生成，当前版本没有时只能重新审核
         if (
            input.coverMode === 'default' &&
            current.ProblemDefaultCover.length === 0
         ) {
            auditReasons.push('cover');
         }
      }

      if (current && auditReasons.length === 0) {
         await prisma.$transaction([
            prisma.problems.update({
               where: { pid: current.pid },
               data: {
                  title: input.title,
                  detail: input.detail,
                  difficulty: input.difficulty,
                  tags: { set: input.tagIds.map((tid) => ({ tid })) },
                  CoverImage:
                     input.coverMode === 'custom' && input.coverImageId
                        ? { connect: { id: input.coverImageId } }
                        : { disconnect: true },
               },
            }),
            // 让「我的题目」列表按最近修改排序
            prisma.baseProblems.update({
               where: { id: baseId },
               data: { updatedAt: new Date() },
            }),
         ]);
         return {
            message: 'Problem info updated without audit',
            problemId: current.pid,
            mode: 'quick' as const,
            auditReasons,
         };
      }

      if (
         input.coverMode === 'default' &&
         !hasEntries(input.referenceAnswerSnapshot)
      ) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: REFERENCE_ANSWER_REQUIRED_MESSAGE,
         });
      }

      // 创建新问题版本
      const { problemId, judgeRecordId } = await prisma.$transaction(
         async (tx) => {
            const version = await handleCreateVersion({
               tx,
               input,
               userId,
               baseProblemId: baseId,
               judgeScript,
            });
            if (currentPid) {
               await tx.problemVersionTransitions.create({
                  data: {
                     baseProblemId: baseId,
                     fromId: currentPid,
                     toId: version.problemId,
                     changeByType: 'user',
                     changeByUserId: userId,
                  },
               });
            }
            return version;
         },
      );

      await createAuditTask({
         judgeServerUrl: judge.serverUrl,
         traceId,
         userId,
         problemId,
         judgeRecordId,
         judgeScript,
         fsSnapshot: input.referenceAnswerSnapshot,
      });

      return {
         message: 'Problem re-uploaded successfully',
         problemId,
         mode: 'audit' as const,
         auditReasons,
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
