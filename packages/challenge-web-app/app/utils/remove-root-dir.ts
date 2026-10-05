import { toProjectMountPath } from './path-utils';

/**
 * 去掉快照里人为包的一层根目录（发布页拖拽上传时的文件夹名，或重发布时的
 * `/answer-template` 合成根），然后把结果归一化为 `/project/...` 形式。
 *
 * 背景：题库里历史快照键有两种写法（`index.html` 与 `/project/index.html`）。
 * 编辑器与判题机统一以 `/project/...` 为项目根挂载，因此这里必须把两种写法
 * 都收敛到 `/project/...`，否则编辑器会再拼一次 `/project/`，形成
 * `project/project/...` 的双层目录。
 */
export const removeRootDir = (project: Record<string, string>) => {
   const newProject: Record<string, string> = {};
   for (const key in project) {
      // key 形如 '/answer-template/index.html' 或 '/my-folder/index.html'：
      // split('/') 得到 ['', '<root>', ...rest]，slice(2) 去掉合成根。
      const rest = key.split('/').slice(2).join('/');
      const newKey = toProjectMountPath(rest);
      newProject[newKey] = project[key]!;
   }
   return newProject;
};
