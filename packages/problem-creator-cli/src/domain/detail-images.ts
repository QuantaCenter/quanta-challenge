import { dirname, resolve } from 'node:path';

/** 平台静态图片路由：/api/static/<图片名>（与 Web 应用同源，题面里用相对地址即可） */
export const STATIC_IMAGE_PREFIX = '/api/static/';

/** 平台静态路由允许的扩展名（challenge-web-app/server/api/static/[filePath].ts） */
export const UPLOADABLE_IMAGE_EXTENSIONS = [
   '.png',
   '.jpg',
   '.jpeg',
   '.gif',
   '.webp',
   '.svg',
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface LocalImageRef {
   /** 题面里写的原始路径 */
   ref: string;
   /** 解析后的绝对路径 */
   file: string;
   /** 题面中的 1-based 行号 */
   line: number;
}

const MARKDOWN_IMAGE =
   /(!\[[^\]]*\]\(\s*<?)([^)\s>]+)(>?(?:\s+"[^"]*")?\s*\))/g;
const HTML_IMAGE = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"'\\]+)(["'])/gi;

/** 协议、协议相对、站内绝对路径、锚点都不算本地文件 */
export const isLocalImageRef = (ref: string): boolean =>
   !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(ref);

/** 题面里相对路径的基准：detailFile 所在目录，内联题面则是题目目录 */
export const detailBaseDir = (config: {
   rootDir: string;
   detailFile?: string;
}): string =>
   config.detailFile
      ? dirname(resolve(config.rootDir, config.detailFile))
      : config.rootDir;

export const findLocalImageRefs = (
   markdown: string,
   baseDir: string,
): LocalImageRef[] => {
   const refs: LocalImageRef[] = [];
   const seen = new Set<string>();
   for (const pattern of [MARKDOWN_IMAGE, HTML_IMAGE]) {
      for (const match of markdown.matchAll(pattern)) {
         const ref = match[2] ?? '';
         if (!isLocalImageRef(ref) || seen.has(ref)) continue;
         seen.add(ref);
         refs.push({
            ref,
            file: resolve(baseDir, decodeURI(ref)),
            line: markdown.slice(0, match.index).split('\n').length,
         });
      }
   }
   return refs;
};

/** 把题面（或内联题面所在的配置源码）里的本地图片路径换成平台地址 */
export const replaceImageRefs = (
   text: string,
   mapping: ReadonlyMap<string, string>,
): string => {
   const swap = (
      whole: string,
      head: string,
      ref: string,
      tail: string,
   ): string => {
      const url = mapping.get(ref);
      return url === undefined ? whole : `${head}${url}${tail}`;
   };
   return text.replace(MARKDOWN_IMAGE, swap).replace(HTML_IMAGE, swap);
};
