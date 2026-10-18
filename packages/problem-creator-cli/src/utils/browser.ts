import { spawn } from 'node:child_process';

/** 打开系统默认浏览器（不引入 open 依赖，三平台各一条命令）；返回"是否成功发起"，调用方必须同时打印 URL 供手动打开。 */
export const openBrowser = async (url: string): Promise<boolean> => {
   const platform = process.platform;
   const command =
      platform === 'darwin'
         ? { file: 'open', args: [url] }
         : platform === 'win32'
           ? // cmd 的 start 是内置命令；第一个空参数是为了让 start 把带引号的 URL
             // 当作标题之外的参数（Windows 上 start 会把第一个引号参数当窗口标题）。
             { file: 'cmd', args: ['/c', 'start', '', url] }
           : { file: 'xdg-open', args: [url] };

   return new Promise<boolean>((resolve) => {
      try {
         const child = spawn(command.file, command.args, {
            stdio: 'ignore',
            detached: true,
         });
         child.on('error', () => resolve(false));
         child.on('spawn', () => {
            child.unref();
            resolve(true);
         });
      } catch {
         resolve(false);
      }
   });
};
