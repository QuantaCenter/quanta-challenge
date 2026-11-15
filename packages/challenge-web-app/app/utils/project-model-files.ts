import ignore from 'ignore';
import { normalizePath } from './path-utils';

/** 返回可预加载到 Monaco 的项目路径；内容和二进制判断留到创建模型时处理。 */
export const getProjectModelPaths = (
   paths: string[],
   gitignore: string,
   ignorePatterns: string[],
) => {
   const excluded = ignore({ ignorecase: false }).add([
      'node_modules/',
      '.git/',
      ...ignorePatterns,
   ]);
   const projectIgnore = ignore({ ignorecase: false }).add(gitignore);

   return paths.map(normalizePath).filter((path) => {
      if (!path.startsWith('/project/')) return false;
      const relative = path.slice('/project/'.length);
      return !excluded.ignores(relative) && !projectIgnore.ignores(relative);
   });
};
