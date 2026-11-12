import { TRPCError } from '@trpc/server';
import z from 'zod';
import { LAB_TEMPLATE_CATEGORIES } from '@challenge/shared/lab-templates';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import { ensureSnapshotImageReady } from '../../../services/image-build';
import { findBuiltinLabTemplate } from '../../../services/builtin-lab-templates';
import {
   countLabTemplateProjects,
   findLabTemplate,
   generateLabTemplateId,
   listLabTemplates,
   normalizeLabTemplateFiles,
   toLabTemplateSummary,
} from '../../services/lab-template';

const idSchema = z.object({ id: z.string().min(1) });

const nameSchema = z
   .string()
   .trim()
   .min(1, '模板名称不能为空')
   .max(40, '模板名称最多 40 个字符');
const descriptionSchema = z.string().trim().max(200, '模板简介最多 200 个字符');
const commandSchema = z.string().trim().max(500, '命令最多 500 个字符');
const snapshotImageIdSchema = z.string().min(1).nullable();

/** 内置模板可修改的基础信息 */
const builtinInfoSchema = z.object({
   name: nameSchema,
   description: descriptionSchema,
   installCommand: commandSchema,
   startCommand: commandSchema,
   snapshotImageId: snapshotImageIdSchema,
});

/** 自定义模板的完整内容 */
const customTemplateSchema = builtinInfoSchema.extend({
   category: z.enum(LAB_TEMPLATE_CATEGORIES),
   tags: z
      .array(z.string().trim().min(1).max(20, '标签最多 20 个字符'))
      .max(8, '标签最多 8 个'),
   icon: z
      .string()
      .trim()
      .max(300)
      .refine(
         (value) => !value || /^\/[\w./-]+$/.test(value) || /^https:\/\/\S+$/.test(value),
         '图标地址需为站内路径（如 /icons/vue.png）或 https 地址',
      ),
   entry: z.string().trim().max(512),
   readme: z.string().max(50_000, '说明文档最多 50000 个字符'),
   files: z.record(z.string(), z.string()),
   enabled: z.boolean(),
});

type CustomTemplateInput = z.infer<typeof customTemplateSchema>;

/** 校验并整理自定义模板数据（文件、入口文件、快照镜像） */
const prepareCustomTemplate = async (input: CustomTemplateInput) => {
   const files = normalizeLabTemplateFiles(input.files);
   const entry = input.entry.replace(/^\/+/, '');
   if (entry && !(entry in files)) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `入口文件「${entry}」不在模板文件中`,
      });
   }
   await ensureSnapshotImageReady(input.snapshotImageId);
   return {
      name: input.name,
      description: input.description,
      category: input.category,
      tags: [...new Set(input.tags)],
      icon: input.icon || null,
      entry,
      installCommand: input.installCommand,
      startCommand: input.startCommand,
      readme: input.readme,
      files,
      snapshotImageId: input.snapshotImageId,
      enabled: input.enabled,
   };
};

const requireCustomTemplate = async (id: string) => {
   const row = await prisma.labTemplate.findUnique({
      where: { id },
      select: { builtin: true },
   });
   if (!row || row.builtin || (await findBuiltinLabTemplate(id))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '自定义模板不存在或已被删除' });
   }
};

/** 实验室模板管理：内置模板可停用 / 修改基础信息，自定义模板可发布 / 编辑 / 删除 */
export const labTemplateAdminRouter = router({
   list: protectedAdminProcedure.query(async () => {
      const [templates, projectCounts] = await Promise.all([
         listLabTemplates({ includeDisabled: true }),
         countLabTemplateProjects(),
      ]);
      return templates.map((template) => {
         const { readme: _readme, ...summary } = toLabTemplateSummary(template);
         return {
            ...summary,
            projectCount: projectCounts.get(template.id) ?? 0,
         };
      });
   }),

   /** 详情：含文件内容；内置模板额外返回模板目录中的默认值，用于对比与恢复默认 */
   detail: protectedAdminProcedure.input(idSchema).query(async ({ input }) => {
      const [template, base] = await Promise.all([
         findLabTemplate(input.id),
         findBuiltinLabTemplate(input.id),
      ]);
      if (!template) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '模板不存在或已被删除' });
      }
      return {
         ...template,
         installCommand: template.installCommand ?? '',
         defaults: base
            ? {
                 name: base.name,
                 description: base.description,
                 installCommand: base.installCommand ?? '',
                 startCommand: base.startCommand,
              }
            : null,
      };
   }),

   setEnabled: protectedAdminProcedure
      .input(idSchema.extend({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
         if (await findBuiltinLabTemplate(input.id)) {
            await prisma.labTemplate.upsert({
               where: { id: input.id },
               create: {
                  id: input.id,
                  builtin: true,
                  enabled: input.enabled,
                  createdBy: ctx.user.userId,
               },
               update: { enabled: input.enabled },
            });
            return { ok: true };
         }
         await requireCustomTemplate(input.id);
         await prisma.labTemplate.update({
            where: { id: input.id },
            data: { enabled: input.enabled },
         });
         return { ok: true };
      }),

   /** 修改内置模板的基础信息：与 template.json 默认值相同的字段保存为 null，之后修改模板目录时自动生效 */
   updateBuiltin: protectedAdminProcedure
      .input(builtinInfoSchema.extend({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
         const base = await findBuiltinLabTemplate(input.id);
         if (!base) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '内置模板不存在' });
         }
         await ensureSnapshotImageReady(input.snapshotImageId);
         const override = (value: string, defaultValue: string) =>
            value === defaultValue ? null : value;
         const data = {
            name: override(input.name, base.name),
            description: override(input.description, base.description),
            installCommand: override(input.installCommand, base.installCommand ?? ''),
            startCommand: override(input.startCommand, base.startCommand),
            snapshotImageId: input.snapshotImageId,
         };
         await prisma.labTemplate.upsert({
            where: { id: input.id },
            create: { id: input.id, builtin: true, createdBy: ctx.user.userId, ...data },
            update: data,
         });
         return { ok: true };
      }),

   /** 内置模板恢复默认：清除基础信息覆盖与快照镜像绑定（不影响启用状态） */
   resetBuiltin: protectedAdminProcedure.input(idSchema).mutation(async ({ input }) => {
      if (!(await findBuiltinLabTemplate(input.id))) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '内置模板不存在' });
      }
      await prisma.labTemplate.updateMany({
         where: { id: input.id },
         data: {
            name: null,
            description: null,
            installCommand: null,
            startCommand: null,
            snapshotImageId: null,
         },
      });
      return { ok: true };
   }),

   /** 发布自定义模板 */
   create: protectedAdminProcedure
      .input(customTemplateSchema)
      .mutation(async ({ ctx, input }) => {
         const data = await prepareCustomTemplate(input);
         const created = await prisma.labTemplate.create({
            data: {
               id: generateLabTemplateId(),
               builtin: false,
               createdBy: ctx.user.userId,
               ...data,
            },
            select: { id: true },
         });
         return created;
      }),

   /** 编辑自定义模板：文件变更只影响之后创建 / 重置的项目 */
   update: protectedAdminProcedure
      .input(customTemplateSchema.extend({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
         const { id, ...rest } = input;
         await requireCustomTemplate(id);
         const data = await prepareCustomTemplate(rest);
         await prisma.labTemplate.update({ where: { id }, data });
         return { ok: true };
      }),

   /** 删除自定义模板：已创建的项目保留，但无法再重置为模板初始文件 */
   remove: protectedAdminProcedure.input(idSchema).mutation(async ({ input }) => {
      await requireCustomTemplate(input.id);
      await prisma.labTemplate.delete({ where: { id: input.id } });
      return { ok: true };
   }),
});
