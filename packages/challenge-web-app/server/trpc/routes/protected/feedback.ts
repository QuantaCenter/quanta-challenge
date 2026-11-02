import { compressUploadedImage } from '@challenge/shared/image/compress-upload';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import prisma from '~~/lib/prisma';
import { protectedProcedure } from '../../protected-trpc';
import {
   feedbackDiagnosticSchema,
   feedbackIdSchema,
   feedbackListSchema,
   feedbackTypeSchema,
} from '../../schemas/feedback';
import { imageFormDataSchema } from '../../schemas/image-upload';
import { router } from '../../trpc';

const SubmitFeedbackSchema = z.object({
   submissionKey: z.string().uuid(),
   type: feedbackTypeSchema,
   title: z
      .string('请填写一句话描述')
      .trim()
      .min(1, '请填写一句话描述')
      .max(80, '描述不能超过 80 字'),
   description: z.string().trim().min(1, '请填写详细描述').max(3000),
   // 关联题目（母题 baseId）
   baseProblemId: z
      .number('关联题目 ID 必须是数字')
      .int()
      .positive()
      .optional(),
   // 仅保存页面路径，不含查询参数。
   pagePath: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)[^?#]*$/, '页面路径不能包含查询参数')
      .optional(),
   // 用户允许附带的基本环境信息。
   diagnostic: feedbackDiagnosticSchema.optional(),
   imageIds: z
      .array(z.string().min(1).max(100))
      .max(3, '截图最多 3 张')
      .refine((ids) => new Set(ids).size === ids.length, '截图不能重复')
      .default([]),
});

const submitFeedbackProcedure = protectedProcedure
   .input(SubmitFeedbackSchema)
   .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { imageIds, ...data } = input;

      const feedback = await prisma.$transaction(async (tx) => {
         await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
         const existing = await tx.feedback.findUnique({
            where: { submissionKey: data.submissionKey },
            select: { id: true, authorId: true },
         });
         if (existing?.authorId === userId) return existing;
         if (existing)
            throw new TRPCError({
               code: 'CONFLICT',
               message: '提交标识无效，请重新打开表单',
            });
         const recent = await tx.feedback.count({
            where: {
               authorId: userId,
               createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
            },
         });
         if (recent >= 10)
            throw new TRPCError({
               code: 'TOO_MANY_REQUESTS',
               message: '提交过于频繁，请稍后重试',
            });
         if (
            data.baseProblemId &&
            !(await tx.baseProblems.findFirst({
               where: {
                  id: data.baseProblemId,
                  CurrentProblem: { status: 'published' },
               },
               select: { id: true },
            }))
         ) {
            throw new TRPCError({
               code: 'BAD_REQUEST',
               message: '关联题目不存在或不可见',
            });
         }
         const created = await tx.feedback.create({
            data: {
               ...data,
               diagnostic: data.diagnostic,
               authorId: userId,
            },
         });

         if (imageIds.length > 0) {
            const linked = await tx.feedbackAttachment.updateMany({
               where: {
                  id: { in: imageIds },
                  ownerId: userId,
                  feedbackId: null,
               },
               data: { feedbackId: created.id },
            });
            if (linked.count !== imageIds.length) {
               throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: '截图已失效或不属于当前账号，请重新上传',
               });
            }
         }
         await tx.feedbackEvent.create({
            data: {
               feedbackId: created.id,
               actorName: '反馈用户',
               status: 'pending',
               reply: '提交了反馈',
            },
         });

         return created;
      });

      return { id: feedback.id };
   });

// 我的反馈列表（游标分页）
const listMyFeedbackProcedure = protectedProcedure
   .input(feedbackListSchema)
   .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { cursor, limit, status, type, keyword } = input;

      const feedbacks = await prisma.feedback.findMany({
         where: {
            authorId: userId,
            status,
            type,
            title: keyword
               ? { contains: keyword, mode: 'insensitive' }
               : undefined,
         },
         orderBy: { id: 'desc' },
         take: limit + 1,
         cursor: cursor == null ? undefined : { id: cursor },
         select: {
            id: true,
            type: true,
            title: true,
            description: true,
            status: true,
            reply: true,
            resolvedAt: true,
            baseProblemId: true,
            createdAt: true,
            baseProblem: {
               select: {
                  CurrentProblem: { select: { title: true } },
               },
            },
            updatedAt: true,
            attachments: { select: { id: true } },
            events: {
               orderBy: { id: 'asc' },
               select: {
                  id: true,
                  actorName: true,
                  status: true,
                  reply: true,
                  createdAt: true,
               },
            },
         },
      });

      let nextCursor: number | null = null;
      if (feedbacks.length > limit) {
         const last = feedbacks.pop()!;
         nextCursor = last.id;
      }

      return { items: feedbacks, nextCursor };
   });

// 关联题目搜索（返回 baseId + 标题，供反馈抽屉的选择器使用）
const SearchProblemsSchema = z.object({
   keyword: z.string().min(1, '请输入搜索关键字').max(50),
   limit: z.number('Limit must be a number').int().min(1).max(20).default(8),
});

const searchProblemsProcedure = protectedProcedure
   .input(SearchProblemsSchema)
   .query(async ({ input }) => {
      const problems = await prisma.baseProblems.findMany({
         where: {
            CurrentProblem: {
               status: 'published',
               title: {
                  contains: input.keyword,
                  mode: 'insensitive',
               },
            },
         },
         take: input.limit,
         orderBy: { id: 'desc' },
         select: {
            id: true,
            CurrentProblem: {
               select: { pid: true, title: true },
            },
         },
      });

      return problems
         .filter((p) => p.CurrentProblem !== null)
         .map((p) => ({
            baseId: p.id,
            pid: p.CurrentProblem!.pid,
            title: p.CurrentProblem!.title,
         }));
   });

// 反馈详情（仅作者本人或管理员）
const getFeedbackDetailProcedure = protectedProcedure
   .input(feedbackIdSchema)
   .query(async ({ ctx, input }) => {
      const { userId, role } = ctx.user;
      const feedback = await prisma.feedback.findUnique({
         where: { id: input.id },
         select: {
            id: true,
            type: true,
            title: true,
            description: true,
            status: true,
            reply: true,
            resolvedAt: true,
            baseProblemId: true,
            pagePath: true,
            diagnostic: true,
            createdAt: true,
            authorId: true,
            baseProblem: {
               select: {
                  CurrentProblem: { select: { title: true } },
               },
            },
            updatedAt: true,
            attachments: { select: { id: true } },
            events: {
               orderBy: { id: 'asc' },
               select: {
                  id: true,
                  actorName: true,
                  status: true,
                  reply: true,
                  createdAt: true,
               },
            },
         },
      });

      if (!feedback) {
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '反馈不存在',
         });
      }

      const isAdmin = role !== 'USER';
      if (feedback.authorId !== userId && !isAdmin) {
         throw new TRPCError({
            code: 'FORBIDDEN',
            message: '无权查看该反馈',
         });
      }

      return feedback;
   });

const uploadScreenshot = protectedProcedure
   .input(imageFormDataSchema)
   .mutation(async ({ ctx, input }) => {
      const bytes = input.buffer;
      const mimeType = bytes
         .subarray(0, 8)
         .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
         ? 'image/png'
         : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
           ? 'image/jpeg'
           : bytes.toString('ascii', 0, 4) === 'RIFF' &&
               bytes.toString('ascii', 8, 12) === 'WEBP'
             ? 'image/webp'
             : null;
      if (!mimeType)
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '仅支持 PNG、JPG 和 WebP 图片',
         });
      const extension = {
         'image/png': '.png',
         'image/jpeg': '.jpg',
         'image/webp': '.webp',
      }[mimeType];
      let content: Buffer;
      try {
         content = await compressUploadedImage(bytes, `screenshot${extension}`);
      } catch {
         throw new TRPCError({ code: 'BAD_REQUEST', message: '图片内容无效' });
      }
      return prisma.$transaction(async (tx) => {
         await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.user.userId}))`;
         await tx.feedbackAttachment.deleteMany({
            where: {
               ownerId: ctx.user.userId,
               feedbackId: null,
               createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
         });
         const recent = await tx.feedbackAttachment.count({
            where: {
               ownerId: ctx.user.userId,
               createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
            },
         });
         if (recent >= 30)
            throw new TRPCError({
               code: 'TOO_MANY_REQUESTS',
               message: '上传过于频繁，请稍后重试',
            });
         return tx.feedbackAttachment.create({
            data: { ownerId: ctx.user.userId, mimeType, content },
            select: { id: true },
         });
      });
   });

const screenshot = protectedProcedure
   .input(z.object({ id: z.string().min(1).max(100) }))
   .query(async ({ ctx, input }) => {
      setHeader(ctx.event, 'Cache-Control', 'private, no-store');
      const attachment = await prisma.feedbackAttachment.findFirst({
         where: {
            id: input.id,
            ...(ctx.user.role === 'USER' ? { ownerId: ctx.user.userId } : {}),
         },
         select: { mimeType: true, content: true },
      });
      if (!attachment)
         throw new TRPCError({
            code: 'NOT_FOUND',
            message: '截图不存在或无权查看',
         });
      return {
         url: `data:${attachment.mimeType};base64,${Buffer.from(attachment.content).toString('base64')}`,
      };
   });

export const feedbackRouter = router({
   context: protectedProcedure
      .input(z.object({ path: z.string().max(500) }))
      .query(async ({ ctx, input }) => {
         const match = /^\/challenge\/(editor|record)\/(\d+)(?:\/|$)/.exec(
            input.path,
         );
         if (!match) return null;
         const id = Number(match[2]);
         if (!Number.isSafeInteger(id)) return null;
         const problem =
            match[1] === 'editor'
               ? await prisma.problems.findFirst({
                    where: { pid: id, status: 'published' },
                    select: { baseId: true, pid: true, title: true },
                 })
               : (
                    await prisma.judgeRecords.findFirst({
                       where: { id, userId: ctx.user.userId },
                       select: {
                          problem: {
                             select: { baseId: true, pid: true, title: true },
                          },
                       },
                    })
                 )?.problem;
         return problem ?? null;
      }),
   uploadScreenshot,
   screenshot,
   submit: submitFeedbackProcedure,
   listMine: listMyFeedbackProcedure,
   detail: getFeedbackDetailProcedure,
   searchProblems: searchProblemsProcedure,
});
