import z from 'zod';
import {
   LAB_TEMPLATE_CATEGORIES,
   type LabTemplate,
} from '@challenge/shared/lab-templates';
import {
   encodeSnapshotBytes,
   hasBinarySnapshotExtension,
} from '@challenge/shared/snapshot-content';
import { logger } from '~~/server/utils/logger';

/**
 * 实验室内置模板：在运行时读取模板目录，组装成 LabTemplate。
 *
 * 模板目录位于 packages/shared/service/lab-templates/templates，通过 nuxt.config 的
 * nitro.serverAssets 挂载为 `assets:lab-templates`：
 *
 *   <模板 id>/template.json   基础信息（见 metaSchema）
 *   <模板 id>/README.md       说明文档（可省略）
 *   <模板 id>/files/**        项目文件（可省略，例如空白项目）
 *
 * - 生产环境：模板文件随服务端产物打包，内容不可变，首次读取后缓存在内存中；
 * - 开发环境：每次读取都直接访问磁盘，修改模板文件后无需重启。
 *
 * 单个模板格式有误时只跳过该模板并记录错误日志，不影响其他模板。
 */

const STORAGE_BASE = 'assets:lab-templates';
const META_FILE = 'template.json';
const README_FILE = 'README.md';
const FILES_DIR = 'files';

/** 模板 id 会写进实验室项目（LabProject.templateId），发布后不要再改名 */
const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** 自定义模板 id 的前缀，内置模板不能占用 */
const CUSTOM_TEMPLATE_ID_PREFIX = 'custom-';

const metaSchema = z.strictObject({
   name: z.string().trim().min(1, 'name 不能为空'),
   description: z.string().default(''),
   category: z.enum(LAB_TEMPLATE_CATEGORIES),
   tags: z.array(z.string().trim().min(1)).default([]),
   icon: z.string().min(1, 'icon 不能为空'),
   /** 首次打开的文件（相对项目根），留空则自动选择 */
   entry: z.string().default(''),
   /** 省略或留空则跳过依赖安装 */
   installCommand: z.string().optional(),
   /** 留空则只进入项目目录 */
   startCommand: z.string().default(''),
   /** 列表排序，越小越靠前；相同时按 id 排序 */
   order: z.number().default(Number.MAX_SAFE_INTEGER),
});

/**
 * 统一资源内容：生产环境的文本文件是字符串，其余（包括 .ts / .vue 等无法识别 MIME 的文件）
 * 是 Uint8Array；开发环境的 fs 驱动一律返回 Buffer。
 * 字节内容按扩展名与 UTF-8 校验编码为快照内容：文本原样返回，二进制转为 data URL。
 */
const toContent = (path: string, raw: unknown): string => {
   if (typeof raw === 'string') return raw;
   if (raw instanceof Uint8Array) {
      return encodeSnapshotBytes(raw, hasBinarySnapshotExtension(path));
   }
   if (raw instanceof ArrayBuffer) {
      return encodeSnapshotBytes(new Uint8Array(raw), hasBinarySnapshotExtension(path));
   }
   throw new Error(`无法读取文件 ${path}`);
};

const readContent = async (key: string, path: string) => {
   const raw = await useStorage(STORAGE_BASE).getItemRaw(key);
   if (raw === null || raw === undefined) {
      throw new Error(`文件 ${path} 不存在`);
   }
   return toContent(path, raw);
};

type LoadedTemplate = LabTemplate & { order: number };

const loadTemplate = async (
   id: string,
   keys: string[],
): Promise<LoadedTemplate> => {
   if (!TEMPLATE_ID_PATTERN.test(id)) {
      throw new Error('目录名只能包含小写字母、数字与连字符，且不能以连字符开头');
   }
   if (id.startsWith(CUSTOM_TEMPLATE_ID_PREFIX)) {
      throw new Error(`目录名不能以 ${CUSTOM_TEMPLATE_ID_PREFIX} 开头（该前缀保留给自定义模板）`);
   }

   const metaKey = `${id}:${META_FILE}`;
   if (!keys.includes(metaKey)) {
      throw new Error(`缺少 ${META_FILE}`);
   }
   let metaJson: unknown;
   try {
      metaJson = JSON.parse(await readContent(metaKey, META_FILE));
   } catch (error) {
      throw new Error(`${META_FILE} 不是合法的 JSON：${(error as Error).message}`);
   }
   const parsed = metaSchema.safeParse(metaJson);
   if (!parsed.success) {
      throw new Error(`${META_FILE} 格式有误：${z.prettifyError(parsed.error)}`);
   }
   const meta = parsed.data;

   const readmeKey = `${id}:${README_FILE}`;
   const filesPrefix = `${id}:${FILES_DIR}:`;
   const fileKeys = keys.filter((key) => key.startsWith(filesPrefix));
   const unknownKeys = keys.filter(
      (key) => key !== metaKey && key !== readmeKey && !key.startsWith(filesPrefix),
   );
   if (unknownKeys.length) {
      logger.warn(
         { templateId: id, keys: unknownKeys },
         `实验室模板目录中的这些文件不会被使用，项目文件请放在 ${FILES_DIR}/ 下`,
      );
   }

   const [readme, fileEntries] = await Promise.all([
      keys.includes(readmeKey) ? readContent(readmeKey, README_FILE) : '',
      Promise.all(
         fileKeys.map(async (key) => {
            const path = key.slice(filesPrefix.length).split(':').join('/');
            return [path, await readContent(key, path)] as const;
         }),
      ),
   ]);
   const files = Object.fromEntries(
      fileEntries.sort(([a], [b]) => a.localeCompare(b)),
   );

   const entry = meta.entry.replace(/^\/+/, '');
   if (entry && !(entry in files)) {
      logger.warn(
         { templateId: id, entry },
         '实验室模板的入口文件不存在，打开项目时将自动选择第一个文件',
      );
   }

   return {
      id,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      tags: meta.tags,
      icon: meta.icon,
      entry,
      installCommand: meta.installCommand || undefined,
      startCommand: meta.startCommand,
      readme,
      files,
      order: meta.order,
   };
};

const loadAll = async (): Promise<LabTemplate[]> => {
   const keys = await useStorage(STORAGE_BASE).getKeys();
   const groups = new Map<string, string[]>();
   for (const key of keys) {
      const separator = key.indexOf(':');
      // 根目录下的散落文件不属于任何模板
      if (separator <= 0) continue;
      const id = key.slice(0, separator);
      groups.set(id, [...(groups.get(id) ?? []), key]);
   }

   const results = await Promise.all(
      [...groups].map(async ([id, groupKeys]) => {
         try {
            return await loadTemplate(id, groupKeys);
         } catch (error) {
            logger.error(
               { templateId: id, error: (error as Error).message },
               '实验室内置模板加载失败，已跳过',
            );
            return null;
         }
      }),
   );

   return results
      .filter((template): template is LoadedTemplate => template !== null)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ order: _order, ...template }) => template);
};

let cache: Promise<LabTemplate[]> | null = null;

/** 全部内置模板（按 order 排序） */
export const listBuiltinLabTemplates = (): Promise<LabTemplate[]> => {
   if (process.env.NODE_ENV !== 'production') return loadAll();
   cache ??= loadAll().catch((error) => {
      cache = null;
      throw error;
   });
   return cache;
};

export const findBuiltinLabTemplate = async (id: string | undefined) => {
   if (!id) return undefined;
   const templates = await listBuiltinLabTemplates();
   return templates.find((template) => template.id === id);
};
