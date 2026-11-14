import { randomBytes } from 'crypto';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import type { WorkshopTemplate } from '@challenge/shared/workshop-templates';
import { hasBinarySnapshotExtension } from '@challenge/shared/snapshot-content';
import prisma from '~~/lib/prisma';
import {
   findBuiltinWorkshopTemplate,
   listBuiltinWorkshopTemplates,
} from '../../services/builtin-workshop-templates';

/**
 * 工坊模板：内置模板（模板目录，见 builtin-workshop-templates.ts）与管理员发布的自定义模板（数据库）合并后的统一视图。
 * - 内置模板的数据库行只保存覆盖配置，字段为 null 时沿用 template.json 中的默认值；
 * - 自定义模板的全部内容都保存在数据库中。
 */

export const DEFAULT_WORKSHOP_TEMPLATE_ICON = '/icons/document.png';

/** 自定义模板文件的数量与总大小上限 */
export const WORKSHOP_TEMPLATE_FILE_LIMITS = {
   maxFiles: 500,
   maxBytes: 2 * 1024 * 1024,
};

export const workshopTemplateSnapshotImageSelect = {
   id: true,
   name: true,
   status: true,
   fileName: true,
   formatVersion: true,
   sizeBytes: true,
} satisfies Prisma.ImageBuildSelect;

const rowInclude = {
   snapshotImage: { select: workshopTemplateSnapshotImageSelect },
} satisfies Prisma.WorkshopTemplateInclude;

type WorkshopTemplateRow = Prisma.WorkshopTemplateGetPayload<{ include: typeof rowInclude }>;

export type WorkshopTemplateSnapshotImage = NonNullable<WorkshopTemplateRow['snapshotImage']>;

export interface ResolvedWorkshopTemplate extends WorkshopTemplate {
   builtin: boolean;
   enabled: boolean;
   /** 内置模板是否被管理员修改过基础信息或绑定了快照镜像（自定义模板恒为 false） */
   customized: boolean;
   snapshotImageId: string | null;
   snapshotImage: WorkshopTemplateSnapshotImage | null;
   /** 数据库行的更新时间；未做过任何配置的内置模板为 null */
   updatedAt: Date | null;
}

/** 读取 JSON 字段中的「字符串 -> 字符串」映射（模板文件），非字符串的值忽略 */
const parseStringRecord = (value: Prisma.JsonValue | null): Record<string, string> => {
   if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
   return Object.fromEntries(
      Object.entries(value).filter(
         (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
   );
};

const resolveBuiltin = (
   base: WorkshopTemplate,
   row?: WorkshopTemplateRow | null,
): ResolvedWorkshopTemplate => {
   const installCommand = row?.installCommand ?? base.installCommand ?? '';
   return {
      ...base,
      name: row?.name ?? base.name,
      description: row?.description ?? base.description,
      installCommand: installCommand || undefined,
      startCommand: row?.startCommand ?? base.startCommand,
      builtin: true,
      enabled: row?.enabled ?? true,
      customized:
         !!row &&
         [
            row.name,
            row.description,
            row.installCommand,
            row.startCommand,
            row.snapshotImageId,
         ].some((value) => value !== null),
      snapshotImageId: row?.snapshotImageId ?? null,
      snapshotImage: row?.snapshotImage ?? null,
      updatedAt: row?.updatedAt ?? null,
   };
};

const resolveCustom = (row: WorkshopTemplateRow): ResolvedWorkshopTemplate => ({
   id: row.id,
   name: row.name || '未命名模板',
   description: row.description ?? '',
   category: row.category || 'basic',
   tags: row.tags,
   icon: row.icon || DEFAULT_WORKSHOP_TEMPLATE_ICON,
   entry: row.entry ?? '',
   installCommand: row.installCommand || undefined,
   startCommand: row.startCommand ?? '',
   readme: row.readme ?? '',
   files: parseStringRecord(row.files),
   builtin: false,
   enabled: row.enabled,
   customized: false,
   snapshotImageId: row.snapshotImageId,
   snapshotImage: row.snapshotImage,
   updatedAt: row.updatedAt,
});

/** 全部模板：内置模板按 template.json 中的 order 在前，自定义模板按发布时间在后 */
export const listWorkshopTemplates = async (
   options: { includeDisabled?: boolean } = {},
) => {
   const [builtins, rows] = await Promise.all([
      listBuiltinWorkshopTemplates(),
      prisma.workshopTemplate.findMany({
         include: rowInclude,
         orderBy: { createdAt: 'asc' },
      }),
   ]);
   const builtinIds = new Set(builtins.map((base) => base.id));
   const rowMap = new Map(rows.map((row) => [row.id, row]));
   const templates = [
      ...builtins.map((base) => resolveBuiltin(base, rowMap.get(base.id))),
      // 内置模板目录被删除后，残留的覆盖配置行直接忽略
      ...rows
         .filter((row) => !row.builtin && !builtinIds.has(row.id))
         .map(resolveCustom),
   ];
   return options.includeDisabled
      ? templates
      : templates.filter((template) => template.enabled);
};

/** 按 id 查找模板（包含已停用的模板），不存在时返回 null */
export const findWorkshopTemplate = async (
   id: string,
): Promise<ResolvedWorkshopTemplate | null> => {
   const [base, row] = await Promise.all([
      findBuiltinWorkshopTemplate(id),
      prisma.workshopTemplate.findUnique({
         where: { id },
         include: rowInclude,
      }),
   ]);
   if (base) return resolveBuiltin(base, row);
   if (!row || row.builtin) return null;
   return resolveCustom(row);
};

/** 去掉文件内容，附带文件数量：列表接口不下发文件内容 */
export const toWorkshopTemplateSummary = ({
   files,
   ...template
}: ResolvedWorkshopTemplate) => ({
   ...template,
   fileCount: Object.keys(files).length,
});

/** 各模板被工坊项目引用的数量 */
export const countWorkshopTemplateProjects = async () => {
   const rows = await prisma.workshopProject.groupBy({
      by: ['templateId'],
      _count: { _all: true },
   });
   return new Map(rows.map((row) => [row.templateId, row._count._all]));
};

const IGNORED_PATH = /(^|\/)(node_modules|\.git)(\/|$)/;

/**
 * 校验并规范化自定义模板文件：路径统一为相对项目根、不允许 `..` 等非法片段，
 * 只接受文本文件（二进制文件请放在快照镜像中），node_modules / .git 静默跳过。
 */
export const normalizeWorkshopTemplateFiles = (files: Record<string, string>) => {
   const result: Record<string, string> = {};
   let totalBytes = 0;
   for (const [raw, content] of Object.entries(files)) {
      const path = raw.replace(/\\/g, '/').replace(/^\/+/, '');
      const segments = path.split('/');
      if (
         !path ||
         path.length > 512 ||
         path.includes('\0') ||
         segments.some((segment) => !segment || segment === '.' || segment === '..')
      ) {
         throw new TRPCError({ code: 'BAD_REQUEST', message: `非法的文件路径：${raw}` });
      }
      if (IGNORED_PATH.test(path)) continue;
      if (content.startsWith('data:') || hasBinarySnapshotExtension(path)) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `模板只支持文本文件，「${path}」是二进制文件`,
         });
      }
      totalBytes += Buffer.byteLength(content);
      result[path] = content;
   }
   const count = Object.keys(result).length;
   if (count > WORKSHOP_TEMPLATE_FILE_LIMITS.maxFiles) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `模板文件最多 ${WORKSHOP_TEMPLATE_FILE_LIMITS.maxFiles} 个，当前 ${count} 个`,
      });
   }
   if (totalBytes > WORKSHOP_TEMPLATE_FILE_LIMITS.maxBytes) {
      throw new TRPCError({
         code: 'BAD_REQUEST',
         message: `模板文件总大小不能超过 ${WORKSHOP_TEMPLATE_FILE_LIMITS.maxBytes / 1024 / 1024}MB`,
      });
   }
   return result;
};

export const generateWorkshopTemplateId = () =>
   `custom-${randomBytes(6).toString('hex')}`;
