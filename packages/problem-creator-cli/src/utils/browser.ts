import { spawn } from 'node:child_process';

/**
 * 打开系统默认浏览器。
 *
 * 不引入 `open` 之类的依赖：三个平台各一条命令，代码量比适配依赖的
 * 版本差异更可控，也不会因为依赖的 postinstall 脚本在受限环境里失败。
 *
 * 返回值表示"是否成功发起"而不是"用户是否看到了页面"——后者无法探测，
 * 所以调用方必须同时把 URL 打印出来，让用户在自动打开失败时可以手动复制。
 * 这是设备码流程能在 SSH / 无 GUI 环境里继续工作的前提。
 */
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
