import type { WebContainer } from '@webcontainer/api';
import { convertToFsTree } from './convert-to-fs-tree';
import { convertToPathContentMap } from './convert-to-path-content-map';

type WebContainerApi = typeof import('@webcontainer/api').WebContainer;
let instance: WebContainer | null = null;

/** 该实例是否已被 teardown（此后所有代理调用都会抛 "Proxy has been released"） */
let released = false;

/** 进行中的 boot 过程，保证并发调用只 boot 一次 */
let bootingPromise: Promise<WebContainer> | null = null;

/** 订阅实例被销毁的事件，及时清空引用，避免继续使用已释放的代理 */
const watchTeardown = (wc: WebContainer) => {
   try {
      // WebContainer 继承自 EventEmitter，'teardown' 在实例销毁时触发。
      // 其类型定义未声明该事件，这里做最小化的结构化断言（而不是整对象 any）。
      const emitter = wc as unknown as {
         on: (event: string, listener: () => void) => void;
      };
      emitter.on('teardown', () => {
         console.warn('[webcontainer] 实例已被 teardown，之后需要重新 boot');
         released = true;
         instance = null;
      });
   } catch (e) {
      console.warn('[webcontainer] 无法订阅 teardown 事件:', e);
   }
};

/** 清空并重新 boot（用于实例已失效时的自愈） */
const resetInstance = () => {
   released = false;
   bootingPromise = null;
   instance = null;
};

/** WebContainer.boot() 的硬超时：boot() 自身无超时机制，握手失败会永远挂起，这里把"无限等待"变成可诊断的明确错误（真实失败点以浏览器控制台为准）。 */
const BOOT_TIMEOUT_MS = 45_000;

const initWebContainer = async (
   WebContainer: WebContainerApi,
   options?: IUseWebContainerOptions
) => {
   let timer: ReturnType<typeof setTimeout> | undefined;
   const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
         () =>
            reject(
               new Error(
                  `WebContainer 启动超时（${BOOT_TIMEOUT_MS / 1000} 秒内未就绪）。` +
                     'boot() 需通过 iframe 访问 https://stackblitz.com/headless 并下载运行时。' +
                     '请查看浏览器控制台的 [webcontainer] 日志与红色网络错误以进一步定位。',
               ),
            ),
         BOOT_TIMEOUT_MS,
      );
   });

   try {
      instance = await Promise.race([
         WebContainer.boot({ workdirName: options?.workdirName }),
         timeout,
      ]);
      released = false;
      watchTeardown(instance);
   } finally {
      if (timer) clearTimeout(timer);
   }
};

/** 带并发保护的 boot：多个消费者只真正 boot 一次；不对共享单例做 teardown，避免 "Proxy has been released" 错误。 */
const startBoot = async (
   WebContainer: WebContainerApi,
   options?: IUseWebContainerOptions,
) => {
   if (instance && !released) return instance;
   if (bootingPromise) return bootingPromise;

   bootingPromise = (async () => {
      console.log(
         '[webcontainer] 2/2 正在 boot（会访问 stackblitz.com，首次可能需要几秒）…',
      );
      await initWebContainer(WebContainer, options);
      if (!instance) throw new Error('WebContainer 初始化失败');
      console.log('[webcontainer] boot 成功');
      return instance;
   })();

   try {
      return await bootingPromise;
   } finally {
      bootingPromise = null;
   }
};

export interface IUseWebContainerOptions {
   workdirName?: string;
}

type WebContainerReadyCallback = (wc: WebContainer) => void;

export const useWebContainer = (options?: IUseWebContainerOptions) => {
   const webContainerReadyCallbacks = new Set<WebContainerReadyCallback>();
   const webContainerFailedCallbacks = new Set<(error: unknown) => void>();
   const onWebContainerReady = (callback: WebContainerReadyCallback) => {
      if (instance) {
         return callback(instance);
      }
      webContainerReadyCallbacks.add(callback);
   };
   const onWebContainerFailed = (callback: (error: unknown) => void) => {
      webContainerFailedCallbacks.add(callback);
   };

   /** 等待 WebContainer 就绪：必须同时处理失败分支（boot 抛出时 Promise 永不 settle，界面会永久挂起），就绪/失败二选一。 */
   const getInstance = async () => {
      // 实例已被销毁：清空引用并重新 boot，避免所有调用都撞在
      // "Proxy has been released and is not useable" 上。
      if (!instance && released) {
         console.warn('[webcontainer] 检测到实例已失效，重新初始化…');
         resetInstance();
         const { WebContainer } = await import('@webcontainer/api');
         await startBoot(WebContainer, options);
      }
      if (instance) return instance;
      return new Promise<WebContainer>((resolve, reject) => {
         onWebContainerReady((wc) => resolve(wc));
         onWebContainerFailed((err) => reject(err));
      });
   };

   const mountFileSystem = (pathContentMap: Record<string, string>) => {
      const fsTree = convertToFsTree(pathContentMap);
      return new Promise<void>(async (resolve, reject) => {
         const instance = await getInstance();
         try {
            await instance.mount(fsTree);
            resolve();
         } catch (error) {
            reject(error);
         }
      });
   };

   const makeSnapshot = (dirPath: string) => {
      return new Promise<Record<string, string>>(async (resolve, reject) => {
         const instance = await getInstance();
         try {
            const fsTree = await instance.export(dirPath, {
               format: 'json',
            });
            resolve(convertToPathContentMap(fsTree));
         } catch (error) {
            reject(error);
         }
      });
   };

   const writeFile = async (path: string, content: string | Uint8Array) => {
      const instance = await getInstance();
      const { getParentPath, normalizePath } = await import(
         '~/utils/path-utils'
      );

      // 规范化路径
      const normalizedPath = normalizePath(path);
      const parentPath = getParentPath(normalizedPath);

      try {
         // 如果有父目录且不是根目录，创建父目录
         if (parentPath !== '/') {
            // WebContainer 的 mkdir 不需要前置 /
            const dirForWC = parentPath.slice(1);
            await instance.fs.mkdir(dirForWC, { recursive: true });
         }
         // WebContainer 的 writeFile 不需要前置 /
         const pathForWC = normalizedPath.slice(1);
         await instance.fs.writeFile(pathForWC, content);
      } catch (error) {
         throw new Error(`Failed to write file: ${error}`);
      }
   };

   const removeFile = async (path: string) => {
      const instance = await getInstance();
      const { normalizePath } = await import('~/utils/path-utils');

      // 规范化路径
      const normalizedPath = normalizePath(path);

      try {
         // WebContainer 的 rm 不需要前置 /
         const pathForWC = normalizedPath.slice(1);
         await instance.fs.rm(pathForWC, { recursive: true, force: true });
      } catch (error) {
         throw new Error(`Failed to remove file: ${error}`);
      }
   };

   const runCommand = async (commandLine: string | string[]) => {
      let command: string;
      let args: string[];
      if (typeof commandLine === 'string') {
         const [cmd, ...rest] = commandLine.split(' ');
         if (!cmd) {
            throw new Error('Command not found');
         }
         command = cmd!;
         args = rest;
      } else {
         if (commandLine.length === 0) {
            throw new Error('Command not found');
         }
         command = commandLine[0]!;
         args = commandLine.slice(1);
      }

      const instance = await getInstance();
      return await instance.spawn(command, args);
   };

   const exposeServer = ref<{ port: number; url: string }>();
   const error = ref<{ message: string }>();
   const openedPort = ref<number>();
   const closePort = ref<number>();

   onMounted(async () => {
      try {
         console.log('[webcontainer] 1/2 正在加载 @webcontainer/api 模块…');
         const { WebContainer } = await import('@webcontainer/api');

         if (!instance || released) {
            await startBoot(WebContainer, options);
            webContainerReadyCallbacks.forEach((callback) => callback(instance!));
         }

         instance!.on('server-ready', (port, url) => {
            exposeServer.value = { port, url };
         });

         instance!.on('error', (err) => {
            error.value = err;
         });

         instance!.on('port', (port, type) => {
            if (type === 'open') {
               openedPort.value = port;
            } else {
               closePort.value = port;
            }
         });
      } catch (err: any) {
         // 把失败原因广播出去，避免所有等待者永久挂起
         console.error('[webcontainer] 启动失败:', err);
         error.value = { message: err?.message ?? String(err) };
         webContainerFailedCallbacks.forEach((callback) => callback(err));
      }
   });

   // 注意：这里**不能** teardown。 instance 是模块级单例，整个标签页共用。原实现在 onUnmounted 里调用 instance?.teardown()，于是任何一个消费者卸载（组件重新挂载、路由切换、 HMR）都会把共享实例销毁，之后所有 mount/watch/spawn 都会抛 "Proxy has been released and is not useable" —— 这正是编辑器一直 卡在"正在启动开发容器…"的真实原因。 WebContainer boot 成本很高，本就应该随标签页存活；需要干净状态时刷新页面即可。 若将来确实需要释放，应改为引用计数（最后一个消费者卸载时才 teardown）。

   return {
      onWebContainerReady,
      onWebContainerFailed,
      mountFileSystem,
      makeSnapshot,
      getInstance,
      writeFile,
      removeFile,
      runCommand,
      exposeServer,
      openedPort,
      closePort,
      error,
   };
};
