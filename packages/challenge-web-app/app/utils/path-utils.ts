/**
 * 路径工具函数
 * 统一使用前置 / 的路径格式，例如：/project/index.html
 *
 * 设计原则：
 * 1. 所有路径必须以 / 开头（绝对路径风格）
 * 2. 路径分段始终使用 / 分隔
 * 3. 路径不以 / 结尾（除了根路径 /）
 */

/**
 * 规范化路径，确保路径以 / 开头且不以 / 结尾
 * @param path 原始路径
 * @returns 规范化后的路径
 *
 * @example
 * normalizePath('project/index.html') // '/project/index.html'
 * normalizePath('/project/index.html') // '/project/index.html'
 * normalizePath('project/index.html/') // '/project/index.html'
 * normalizePath('/') // '/'
 * normalizePath('') // '/'
 */
export function normalizePath(path: string): string {
   if (!path || path === '/') return '/';

   // 移除开头和结尾的所有斜杠
   const cleaned = path.replace(/^\/+|\/+$/g, '');

   // 如果清理后为空，返回根路径
   if (!cleaned) return '/';

   // 添加前置斜杠
   return `/${cleaned}`;
}

/**
 * 连接路径片段
 * @param segments 路径片段
 * @returns 连接后的规范化路径
 *
 * @example
 * joinPath('/project', 'src', 'index.html') // '/project/src/index.html'
 * joinPath('project', 'src', 'index.html') // '/project/src/index.html'
 * joinPath('/project/', '/src/', '/index.html/') // '/project/src/index.html'
 */
export function joinPath(...segments: string[]): string {
   if (segments.length === 0) return '/';

   const filtered = segments
      .map((s) => s.replace(/^\/+|\/+$/g, '')) // 移除首尾斜杠
      .filter((s) => s.length > 0); // 过滤空片段

   if (filtered.length === 0) return '/';

   return `/${filtered.join('/')}`;
}

/**
 * 获取路径的父目录
 * @param path 路径
 * @returns 父目录路径
 *
 * @example
 * getParentPath('/project/src/index.html') // '/project/src'
 * getParentPath('/project/index.html') // '/project'
 * getParentPath('/project') // '/'
 * getParentPath('/') // '/'
 */
export function getParentPath(path: string): string {
   const normalized = normalizePath(path);
   if (normalized === '/') return '/';

   const segments = normalized.split('/').filter(Boolean);
   if (segments.length <= 1) return '/';

   return `/${segments.slice(0, -1).join('/')}`;
}

/**
 * 获取路径的文件名或最后一个片段
 * @param path 路径
 * @returns 文件名或最后一个片段
 *
 * @example
 * getBaseName('/project/src/index.html') // 'index.html'
 * getBaseName('/project/src') // 'src'
 * getBaseName('/project') // 'project'
 * getBaseName('/') // ''
 */
export function getBaseName(path: string): string {
   const normalized = normalizePath(path);
   if (normalized === '/') return '';

   const segments = normalized.split('/').filter(Boolean);
   return segments[segments.length - 1] || '';
}

/**
 * 将路径分割成片段数组
 * @param path 路径
 * @returns 路径片段数组
 *
 * @example
 * splitPath('/project/src/index.html') // ['project', 'src', 'index.html']
 * splitPath('project/src/index.html') // ['project', 'src', 'index.html']
 * splitPath('/') // []
 */
export function splitPath(path: string): string[] {
   const normalized = normalizePath(path);
   if (normalized === '/') return [];

   return normalized.split('/').filter(Boolean);
}

/**
 * 检查路径是否是另一个路径的子路径
 * @param childPath 子路径
 * @param parentPath 父路径
 * @returns 是否是子路径
 *
 * @example
 * isChildPath('/project/src/index.html', '/project/src') // true
 * isChildPath('/project/src/index.html', '/project') // true
 * isChildPath('/project/src', '/project/src') // false (相同路径)
 * isChildPath('/project', '/project/src') // false
 */
export function isChildPath(childPath: string, parentPath: string): boolean {
   const normalizedChild = normalizePath(childPath);
   const normalizedParent = normalizePath(parentPath);

   if (normalizedChild === normalizedParent) return false;
   if (normalizedParent === '/') return true;

   return normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * 替换路径的基础路径
 * @param path 原始路径
 * @param oldBase 旧基础路径
 * @param newBase 新基础路径
 * @returns 替换后的路径
 *
 * @example
 * replaceBasePath('/project/src/index.html', '/project/src', '/app/source')
 * // '/app/source/index.html'
 */
export function replaceBasePath(
   path: string,
   oldBase: string,
   newBase: string
): string {
   const normalizedPath = normalizePath(path);
   const normalizedOldBase = normalizePath(oldBase);
   const normalizedNewBase = normalizePath(newBase);

   if (!normalizedPath.startsWith(normalizedOldBase)) {
      return normalizedPath;
   }

   if (normalizedPath === normalizedOldBase) {
      return normalizedNewBase;
   }

   const relativePart = normalizedPath.slice(normalizedOldBase.length);
   return joinPath(normalizedNewBase, relativePart);
}

/**
 * 验证路径是否合法
 * @param path 路径
 * @returns 验证结果，true 表示合法，字符串表示错误信息
 *
 * @example
 * validatePath('/project/index.html') // true
 * validatePath('') // '路径不能为空'
 * validatePath('//project//index.html') // true (会被规范化)
 */
export function validatePath(path: string): true | string {
   if (!path || path.trim().length === 0) {
      return '路径不能为空';
   }

   // 检查是否包含非法字符（根据具体需求调整）
   // 这里仅作为示例，可以根据实际情况扩展
   const illegalChars = /[<>:"|?*]/;
   if (illegalChars.test(path)) {
      return '路径包含非法字符';
   }

   return true;
}

/**
 * 将项目文件路径归一化为 WebContainer 挂载路径（始终以 /project 开头）。
 *
 * 题库里的历史数据存在两种写法：
 *   · 相对项目根的路径（旧数据）：index.html
 *   · 已带项目根目录的路径（新数据）：/project/index.html
 *
 * 编辑器统一按 /project/... 挂载。若直接拼接 `/project/${path}`，第二种数据会变成
 * /project//project/...（界面上表现为 project/project 两层目录，且启动命令 `serve project`
 * 会把内层 project 当成一个子目录列出来）。这里做幂等归一化，两种写法都落到 /project/...。
 *
 * @example
 * toProjectMountPath('index.html')           // '/project/index.html'
 * toProjectMountPath('/project/index.html')  // '/project/index.html'
 * toProjectMountPath('project/index.html')   // '/project/index.html'
 */
export function toProjectMountPath(path: string): string {
   const normalized = normalizePath(path);
   if (normalized === '/project' || normalized.startsWith('/project/')) {
      return normalized;
   }
   return joinPath('/project', normalized);
}

/**
 * 规范化路径内容映射（pathContentMap）
 * 确保所有 key 都是规范化的路径格式
 * @param pathContentMap 原始路径内容映射
 * @returns 规范化后的路径内容映射
 */
export function normalizePathContentMap(
   pathContentMap: Record<string, string>
): Record<string, string> {
   const normalized: Record<string, string> = {};

   for (const [path, content] of Object.entries(pathContentMap)) {
      const normalizedPath = normalizePath(path);
      normalized[normalizedPath] = content;
   }

   return normalized;
}
