import z from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { FileChangeSchema } from '../../services/file-changes';
import { workshopProjectService } from '../../services/workshop-project';
import {
   findWorkshopTemplate,
   listWorkshopTemplates,
   toWorkshopTemplateSummary,
} from '../../services/workshop-template';
import { getWorkshopTagIconMap, pickTagIcons } from '../../services/workshop-tag';
import { listWorkshopCategories } from '../../services/workshop-category';

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

export const workshopRouter = router({
   /** 模板分类（含已停用的，前端据此展示卡片分类标签；分类页签只展示启用的分类） */
   categories: protectedProcedure.query(() => listWorkshopCategories()),

   /** 可用的模板（已停用的不返回），不含文件内容；tagIcons 为上传了图标的工坊标签 */
   templates: protectedProcedure.query(async () => {
      const [templates, tagIconMap] = await Promise.all([
         listWorkshopTemplates(),
         getWorkshopTagIconMap(),
      ]);
      return templates.map((template) => {
         const { id, name, description, category, tags, icon, entry, readme, builtin, fileCount } =
            toWorkshopTemplateSummary(template);
         const tagIcons = pickTagIcons(tags, tagIconMap);
         return { id, name, description, category, tags, tagIcons, icon, entry, readme, builtin, fileCount };
      });
   }),

   /** 模板文件（模板详情弹窗的「模板结构」预览） */
   templateFiles: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
         const template = await findWorkshopTemplate(input.id);
         if (!template || !template.enabled) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在或已停用' });
         }
         return template.files;
      }),

   /** 当前用户的全部工坊项目（按最近修改排序） */
   list: protectedProcedure.query(({ ctx }) =>
      workshopProjectService.list(ctx.user.userId),
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
         workshopProjectService.create({ userId: ctx.user.userId, ...input }),
      ),

   get: protectedProcedure
      .input(ProjectIdSchema)
      .query(({ ctx, input }) => workshopProjectService.get(ctx.user.userId, input.id)),

   update: protectedProcedure
      .input(
         ProjectIdSchema.extend({
            name: NameSchema.optional(),
            description: DescriptionSchema.nullable().optional(),
         }),
      )
      .mutation(async ({ ctx, input }) => {
         const { id, ...data } = input;
         await workshopProjectService.update(ctx.user.userId, id, data);
         return { success: true };
      }),

   delete: protectedProcedure
      .input(ProjectIdSchema)
      .mutation(async ({ ctx, input }) => {
         await workshopProjectService.remove(ctx.user.userId, input.id);
         return { success: true };
      }),

   reset: protectedProcedure
      .input(ProjectIdSchema)
      .mutation(async ({ ctx, input }) => {
         await workshopProjectService.reset(ctx.user.userId, input.id);
         return { success: true };
      }),

   /** 增量同步编辑器 / 终端产生的文件变更；大文件上传走 PUT /api/workshop/projects/:id/files */
   sync: protectedProcedure
      .input(
         ProjectIdSchema.extend({
            changes: z.array(FileChangeSchema),
            revision: z.number().int().optional(),
         }),
      )
      .mutation(({ ctx, input }) =>
         workshopProjectService.sync({
            userId: ctx.user.userId,
            projectId: input.id,
            revision: input.revision,
            changes: input.changes,
         }),
      ),
});
