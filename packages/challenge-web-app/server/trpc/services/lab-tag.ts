import { TRPCError } from '@trpc/server';
import { LAB_TAG_ICON } from '@challenge/shared/lab-templates';
import prisma from '~~/lib/prisma';
import { listBuiltinLabTemplates } from '../../services/builtin-lab-templates';

/**
 * 实验室标签：实验室模板卡片底部的技术栈标签。
 *
 * 可用标签由两部分合并而成：
 * - 内置标签：内置模板（template.json）用到的标签与 LAB_TAG_ICON 收录的技术栈，代码维护；
 * - 已发布的实验室标签：管理员在标签发布页创建的 tags.scope = lab 的标签。
 *   与内置标签同名时覆盖内置标签（例如上传自己的图标），删除后恢复为内置标签。
 *
 * 模板按标签名引用标签（lab_templates.tags / template.json 的 tags），
 * 因此实验室标签名唯一；重命名、删除时同步更新自定义模板。
 */

export interface LabTagItem {
   /** 已发布的实验室标签 id；未被覆盖的内置标签为 null */
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

/** 内置标签名：LAB_TAG_ICON 收录的技术栈 + 内置模板用到的标签 */
export const listBuiltinLabTagNames = async () => {
   const templates = await listBuiltinLabTemplates();
   return [
      ...new Set([
         ...Object.keys(LAB_TAG_ICON),
         ...templates.flatMap((template) => template.tags),
      ]),
   ];
};

const listPublishedLabTags = () =>
   prisma.tags.findMany({
      where: { scope: 'lab' },
      orderBy: { tid: 'asc' },
      include: { image: { select: { name: true } } },
   });

/** 全部可用的实验室标签（按名称排序） */
export const listLabTags = async (): Promise<LabTagItem[]> => {
   const [rows, builtinNames] = await Promise.all([
      listPublishedLabTags(),
      listBuiltinLabTagNames(),
   ]);
   const builtinSet = new Set(builtinNames);
   const publishedNames = new Set(rows.map((row) => row.name));
   const items: LabTagItem[] = [
      ...rows.map((row) => ({
         tid: row.tid,
         name: row.name,
         description: row.description,
         imageId: row.imageId,
         icon: uploadedIconUrl(row.image) ?? LAB_TAG_ICON[row.name] ?? null,
         builtin: builtinSet.has(row.name),
      })),
      ...builtinNames
         .filter((name) => !publishedNames.has(name))
         .map((name) => ({
            tid: null,
            name,
            description: null,
            imageId: null,
            icon: LAB_TAG_ICON[name] ?? null,
            builtin: true,
         })),
   ];
   return items.sort((a, b) => a.name.localeCompare(b.name));
};

/** 标签名 -> 上传的图标地址（只包含上传了图标的已发布标签），未收录的标签由前端按内置图标补齐 */
export const getLabTagIconMap = async () => {
   const rows = await prisma.tags.findMany({
      where: { scope: 'lab', imageId: { not: null } },
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
 * 校验实验室标签名：不能与其他已发布的实验室标签重名（不区分大小写）；
 * 与内置标签只差大小写时提示使用相同写法（相同写法即覆盖内置标签）。
 */
export const ensureLabTagNameAvailable = async (
   name: string,
   excludeTid?: number,
) => {
   const [duplicate, builtinNames] = await Promise.all([
      prisma.tags.findFirst({
         where: {
            scope: 'lab',
            name: { equals: name, mode: 'insensitive' },
            ...(excludeTid ? { tid: { not: excludeTid } } : {}),
         },
         select: { name: true },
      }),
      listBuiltinLabTagNames(),
   ]);
   if (duplicate) {
      throw new TRPCError({
         code: 'CONFLICT',
         message: `已存在实验室标签「${duplicate.name}」`,
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

/** 校验模板标签都是可用的实验室标签 */
export const ensureLabTagsExist = async (tags: string[]) => {
   if (tags.length === 0) return;
   const available = new Set((await listLabTags()).map((tag) => tag.name));
   const missing = tags.filter((tag) => !available.has(tag));
   if (missing.length) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `标签「${missing.join('、')}」不存在，请先在标签发布页创建实验室标签`,
      });
   }
};

/** 各标签被模板使用的次数（内置模板 + 自定义模板，含已停用的模板） */
export const countLabTagUsage = async () => {
   const [builtins, rows] = await Promise.all([
      listBuiltinLabTemplates(),
      prisma.labTemplate.findMany({
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
