import { TRPCError } from '@trpc/server';
import { WORKSHOP_TAG_ICON } from '@challenge/shared/workshop-templates';
import prisma from '~~/lib/prisma';
import { listBuiltinWorkshopTemplates } from '../../services/builtin-workshop-templates';

/**
 * 工坊标签：工坊模板卡片底部的技术栈标签。
 *
 * 可用标签由两部分合并而成：
 * - 内置标签：内置模板（template.json）用到的标签与 WORKSHOP_TAG_ICON 收录的技术栈，代码维护；
 * - 已发布的工坊标签：管理员在标签发布页创建的 tags.scope = workshop 的标签。
 *   与内置标签同名时覆盖内置标签（例如上传自己的图标），删除后恢复为内置标签。
 *
 * 模板按标签名引用标签（workshop_templates.tags / template.json 的 tags），
 * 因此工坊标签名唯一；重命名、删除时同步更新自定义模板。
 */

export interface WorkshopTagItem {
   /** 已发布的工坊标签 id；未被覆盖的内置标签为 null */
   tid: number | null;
   name: string;
   description: string | null;
   imageId: string | null;
   /** 显示用图标：上传的图标 > 内置技术栈图标 > null（由前端补通用图标） */
   icon: string | null;
   /** 是否为内置标签名（已发布的同名标签视为覆盖内置标签） */
   builtin: boolean;
}

const uploadedIconUrl = (image: { name: string } | null) =>
   image ? `/api/static/${image.name}` : null;

/** 内置标签名：WORKSHOP_TAG_ICON 收录的技术栈 + 内置模板用到的标签 */
export const listBuiltinWorkshopTagNames = async () => {
   const templates = await listBuiltinWorkshopTemplates();
   return [
      ...new Set([
         ...Object.keys(WORKSHOP_TAG_ICON),
         ...templates.flatMap((template) => template.tags),
      ]),
   ];
};

const listPublishedWorkshopTags = () =>
   prisma.tags.findMany({
      where: { scope: 'workshop' },
      orderBy: { tid: 'asc' },
      include: { image: { select: { name: true } } },
   });

/** 全部可用的工坊标签（按名称排序） */
export const listWorkshopTags = async (): Promise<WorkshopTagItem[]> => {
   const [rows, builtinNames] = await Promise.all([
      listPublishedWorkshopTags(),
      listBuiltinWorkshopTagNames(),
   ]);
   const builtinSet = new Set(builtinNames);
   const publishedNames = new Set(rows.map((row) => row.name));
   const items: WorkshopTagItem[] = [
      ...rows.map((row) => ({
         tid: row.tid,
         name: row.name,
         description: row.description,
         imageId: row.imageId,
         icon: uploadedIconUrl(row.image) ?? WORKSHOP_TAG_ICON[row.name] ?? null,
         builtin: builtinSet.has(row.name),
      })),
      ...builtinNames
         .filter((name) => !publishedNames.has(name))
         .map((name) => ({
            tid: null,
            name,
            description: null,
            imageId: null,
            icon: WORKSHOP_TAG_ICON[name] ?? null,
            builtin: true,
         })),
   ];
   return items.sort((a, b) => a.name.localeCompare(b.name));
};

/** 标签名 -> 上传的图标地址（只包含上传了图标的已发布标签），未收录的标签由前端按内置图标补齐 */
export const getWorkshopTagIconMap = async () => {
   const rows = await prisma.tags.findMany({
      where: { scope: 'workshop', imageId: { not: null } },
      select: { name: true, image: { select: { name: true } } },
   });
   return new Map(
      rows.flatMap((row) => {
         const url = uploadedIconUrl(row.image);
         return url ? [[row.name, url] as const] : [];
      }),
   );
};

/** 模板标签对应的图标（只返回有上传图标的标签） */
export const pickTagIcons = (tags: string[], iconMap: Map<string, string>) =>
   Object.fromEntries(
      tags.flatMap((tag) => {
         const icon = iconMap.get(tag);
         return icon ? [[tag, icon]] : [];
      }),
   );

/**
 * 校验工坊标签名：不能与其他已发布的工坊标签重名（不区分大小写）；
 * 与内置标签只差大小写时提示使用相同写法（相同写法即覆盖内置标签）。
 */
export const ensureWorkshopTagNameAvailable = async (
   name: string,
   excludeTid?: number,
) => {
   const [duplicate, builtinNames] = await Promise.all([
      prisma.tags.findFirst({
         where: {
            scope: 'workshop',
            name: { equals: name, mode: 'insensitive' },
            ...(excludeTid ? { tid: { not: excludeTid } } : {}),
         },
         select: { name: true },
      }),
      listBuiltinWorkshopTagNames(),
   ]);
   if (duplicate) {
      throw new TRPCError({
         code: 'CONFLICT',
         message: `已存在工坊标签「${duplicate.name}」`,
      });
   }
   const similarBuiltin = builtinNames.find(
      (builtin) => builtin !== name && builtin.toLowerCase() === name.toLowerCase(),
   );
   if (similarBuiltin) {
      throw new TRPCError({
         code: 'CONFLICT',
         message: `已有内置标签「${similarBuiltin}」，如需覆盖请使用完全相同的名称`,
      });
   }
};

/** 校验模板标签都是可用的工坊标签 */
export const ensureWorkshopTagsExist = async (tags: string[]) => {
   if (tags.length === 0) return;
   const available = new Set((await listWorkshopTags()).map((tag) => tag.name));
   const missing = tags.filter((tag) => !available.has(tag));
   if (missing.length) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `标签「${missing.join('、')}」不存在，请先在标签发布页创建工坊标签`,
      });
   }
};

/** 各标签被模板使用的次数（内置模板 + 自定义模板，含已停用的模板） */
export const countWorkshopTagUsage = async () => {
   const [builtins, rows] = await Promise.all([
      listBuiltinWorkshopTemplates(),
      prisma.workshopTemplate.findMany({
         where: { builtin: false },
         select: { tags: true },
      }),
   ]);
   const counts = new Map<string, number>();
   for (const tags of [...builtins.map((t) => t.tags), ...rows.map((r) => r.tags)]) {
      for (const tag of new Set(tags)) {
         counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
   }
   return counts;
};
