import z from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { FileChangeSchema } from '../../services/file-changes';
import { labProjectService } from '../../services/lab-project';

const ProjectIdSchema = z.object({ id: z.string().min(1) });

const NameSchema = z
   .string()
   .trim()
   .min(1, '项目名称不能为空')
   .max(40, '项目名称最多 40 个字符');

const DescriptionSchema = z
   .string()
   .trim()
   .max(200, '项目简介最多 200 个字符');

export const labRouter = router({
   /** 当前用户的全部实验室项目（按最近修改排序） */
   list: protectedProcedure.query(({ ctx }) =>
      labProjectService.list(ctx.user.userId),
   ),

   create: protectedProcedure
      .input(
         z.object({
            templateId: z.string().min(1),
            name: NameSchema,
            description: DescriptionSchema.optional(),
         }),
      )
      .mutation(({ ctx, input }) =>
         labProjectService.create({ userId: ctx.user.userId, ...input }),
      ),

   get: protectedProcedure
      .input(ProjectIdSchema)
      .query(({ ctx, input }) => labProjectService.get(ctx.user.userId, input.id)),

   update: protectedProcedure
      .input(
         ProjectIdSchema.extend({
            name: NameSchema.optional(),
            description: DescriptionSchema.nullable().optional(),
         }),
      )
      .mutation(async ({ ctx, input }) => {
         const { id, ...data } = input;
         await labProjectService.update(ctx.user.userId, id, data);
         return { success: true };
      }),

   delete: protectedProcedure
      .input(ProjectIdSchema)
      .mutation(async ({ ctx, input }) => {
         await labProjectService.remove(ctx.user.userId, input.id);
         return { success: true };
      }),

   reset: protectedProcedure
      .input(ProjectIdSchema)
      .mutation(async ({ ctx, input }) => {
         await labProjectService.reset(ctx.user.userId, input.id);
         return { success: true };
      }),

   /** 增量同步编辑器 / 终端产生的文件变更；大文件上传走 PUT /api/lab/projects/:id/files */
   sync: protectedProcedure
      .input(
         ProjectIdSchema.extend({
            changes: z.array(FileChangeSchema),
            revision: z.number().int().optional(),
         }),
      )
      .mutation(({ ctx, input }) =>
         labProjectService.sync({
            userId: ctx.user.userId,
            projectId: input.id,
            revision: input.revision,
            changes: input.changes,
         }),
      ),
});
