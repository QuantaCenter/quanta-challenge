import { randomBytes } from 'crypto';
import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { listBuiltinLabTemplates } from '../../services/builtin-lab-templates';

/**
 * 实验室模板分类（lab_categories）：分类页签与模板卡片右上角的分类标签。
 * 模板按 id 引用分类：内置模板为 template.json 的 category，自定义模板为 lab_templates.category。
 */

export const labCategorySelect = {
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
export const listLabCategories = () =>
   prisma.labCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: labCategorySelect,
   });

export const generateLabCategoryId = () => `cat-${randomBytes(4).toString('hex')}`;

/** 发布 / 编辑自定义模板时校验分类存在（已停用的分类允许保留，但不在选项中展示） */
export const ensureLabCategoryExists = async (id: string) => {
   const category = await prisma.labCategory.findUnique({
      where: { id },
      select: { id: true },
   });
   if (!category) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '所选模板分类不存在或已被删除' });
   }
};

/** 各分类下的模板数（内置模板 + 自定义模板，含已停用的模板） */
export const countLabCategoryTemplates = async () => {
   const [builtins, rows] = await Promise.all([
      listBuiltinLabTemplates(),
      prisma.labTemplate.findMany({
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
