import { randomBytes } from 'crypto';
import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { listBuiltinWorkshopTemplates } from '../../services/builtin-workshop-templates';

/**
 * 工坊模板分类（workshop_categories）：分类页签与模板卡片右上角的分类标签。
 * 模板按 id 引用分类：内置模板为 template.json 的 category，自定义模板为 workshop_templates.category。
 */

export const workshopCategorySelect = {
   id: true,
   name: true,
   description: true,
   color: true,
   icon: true,
   sortOrder: true,
   enabled: true,
   builtin: true,
} as const;

/** 全部分类（含已停用），按排序 */
export const listWorkshopCategories = () =>
   prisma.workshopCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: workshopCategorySelect,
   });

export const generateWorkshopCategoryId = () => `cat-${randomBytes(4).toString('hex')}`;

/** 发布 / 编辑自定义模板时校验分类存在（已停用的分类允许保留，但不在选项中展示） */
export const ensureWorkshopCategoryExists = async (id: string) => {
   const category = await prisma.workshopCategory.findUnique({
      where: { id },
      select: { id: true },
   });
   if (!category) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '所选模板分类不存在或已被删除' });
   }
};

/** 各分类下的模板数（内置模板 + 自定义模板，含已停用的模板） */
export const countWorkshopCategoryTemplates = async () => {
   const [builtins, rows] = await Promise.all([
      listBuiltinWorkshopTemplates(),
      prisma.workshopTemplate.findMany({
         where: { builtin: false },
         select: { category: true },
      }),
   ]);
   const counts = new Map<string, number>();
   for (const category of [
      ...builtins.map((template) => template.category),
      ...rows.map((row) => row.category || 'basic'),
   ]) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
   }
   return counts;
};
