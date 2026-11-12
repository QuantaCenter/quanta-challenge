import { TRPCError } from '@trpc/server';
import z from 'zod';
import { LAB_CATEGORY_ICON_NAMES } from '@challenge/shared/lab-templates';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   countLabCategoryTemplates,
   generateLabCategoryId,
   listLabCategories,
} from '../../services/lab-category';

const idSchema = z.object({ id: z.string().min(1) });

const categoryInfoSchema = z.object({
   name: z.string().trim().min(1, '分类名称不能为空').max(12, '分类名称最多 12 个字符'),
   description: z.string().trim().max(100, '分类描述最多 100 个字符').default(''),
   // 颜色选择器输出带透明度的 #RRGGBBAA，分类色不使用透明度（文字颜色按不透明背景计算），统一存为 #RRGGBB
   color: z
      .string()
      .regex(
         /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
         '颜色需为 #RGB 或 #RRGGBB',
      )
      .transform((value) => (value.length === 9 ? value.slice(0, 7) : value).toUpperCase()),
   icon: z.enum(LAB_CATEGORY_ICON_NAMES).nullable(),
});

/** 分类名称不能重复（不区分大小写） */
const ensureNameAvailable = async (name: string, excludeId?: string) => {
   const duplicate = await prisma.labCategory.findFirst({
      where: {
         name: { equals: name, mode: 'insensitive' },
         ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { name: true },
   });
   if (duplicate) {
      throw new TRPCError({ code: 'CONFLICT', message: `已存在模板分类「${duplicate.name}」` });
   }
};

/** 模板分类管理：内置分类可修改与停用但不能删除，自定义分类在没有模板使用时可以删除 */
export const labCategoryAdminRouter = router({
   list: protectedAdminProcedure.query(async () => {
      const [categories, counts] = await Promise.all([
         listLabCategories(),
         countLabCategoryTemplates(),
      ]);
      return categories.map((category) => ({
         ...category,
         templateCount: counts.get(category.id) ?? 0,
      }));
   }),

   create: protectedAdminProcedure
      .input(categoryInfoSchema.extend({ enabled: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
         await ensureNameAvailable(input.name);
         const last = await prisma.labCategory.aggregate({ _max: { sortOrder: true } });
         return prisma.labCategory.create({
            data: {
               id: generateLabCategoryId(),
               name: input.name,
               description: input.description || null,
               color: input.color,
               icon: input.icon,
               enabled: input.enabled,
               sortOrder: (last._max.sortOrder ?? -1) + 1,
               createdBy: ctx.user.userId,
            },
            select: { id: true },
         });
      }),

   update: protectedAdminProcedure
      .input(categoryInfoSchema.extend({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
         const { id, ...data } = input;
         await ensureNameAvailable(data.name, id);
         const result = await prisma.labCategory.updateMany({
            where: { id },
            data: {
               ...data,
               description: data.description || null,
            },
         });
         if (result.count === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '模板分类不存在或已被删除' });
         }
         return { ok: true };
      }),

   setEnabled: protectedAdminProcedure
      .input(idSchema.extend({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
         const result = await prisma.labCategory.updateMany({
            where: { id: input.id },
            data: { enabled: input.enabled },
         });
         if (result.count === 0) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '模板分类不存在或已被删除' });
         }
         return { ok: true };
      }),

   /** 按传入顺序重排全部分类 */
   reorder: protectedAdminProcedure
      .input(z.object({ ids: z.array(z.string().min(1)).min(1) }))
      .mutation(async ({ input }) => {
         const existing = await prisma.labCategory.findMany({ select: { id: true } });
         const existingIds = new Set(existing.map((item) => item.id));
         const ids = [...new Set(input.ids)];
         if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
            throw new TRPCError({ code: 'CONFLICT', message: '分类列表已变化，请刷新后重试' });
         }
         await prisma.$transaction(
            ids.map((id, index) =>
               prisma.labCategory.update({ where: { id }, data: { sortOrder: index } }),
            ),
         );
         return { ok: true };
      }),

   /** 删除自定义分类：仍有模板使用时拒绝，需先把模板改到其他分类 */
   remove: protectedAdminProcedure.input(idSchema).mutation(async ({ input }) => {
      const category = await prisma.labCategory.findUnique({
         where: { id: input.id },
         select: { builtin: true, name: true },
      });
      if (!category) {
         throw new TRPCError({ code: 'NOT_FOUND', message: '模板分类不存在或已被删除' });
      }
      if (category.builtin) {
         throw new TRPCError({ code: 'BAD_REQUEST', message: '内置分类不能删除，可以改为停用' });
      }
      const count = (await countLabCategoryTemplates()).get(input.id) ?? 0;
      if (count > 0) {
         throw new TRPCError({
            code: 'CONFLICT',
            message: `仍有 ${count} 个模板属于「${category.name}」，请先把这些模板改到其他分类`,
         });
      }
      await prisma.labCategory.delete({ where: { id: input.id } });
      return { ok: true };
   }),
});
