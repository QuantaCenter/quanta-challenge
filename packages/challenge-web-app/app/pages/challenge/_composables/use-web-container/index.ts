import type { WebContainer } from '@webcontainer/api';
import { convertToFsTree } from './convert-to-fs-tree';
import { convertToPathContentMap } from './convert-to-path-content-map';

type WebContainerApi = typeof import('@webcontainer/api').WebContainer;
let instance: WebContainer | null = null;

/** 该实例是否已被 teardown（此后所有代理调用都会抛 "Proxy has been released"） */
let released = false;

/** 进行中的 boot 过程，保证并发调用只 boot 一次 */
let bootingPromise: Promise<WebContainer> | null = null;

/** 感知实例被销毁，及时清空引用，避免继续使用已释放的代理。 */
const watchTeardown = (wc: WebContainer) => {
   const teardown = wc.teardown.bind(wc);
   wc.teardown = () => {
      released = true;
      instance = null;
      teardown();
   };
};

/** 清空并重新 boot（用于实例已失效时的自愈） */
const resetInstance = () => {
   released = false;
   bootingPromise = null;
   instance = null;
};

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
                  `在线运行环境启动超时（${BOOT_TIMEOUT_MS / 1000} 秒内未就绪）。` +
                     'boot() 需通过 iframe 访问 https://stackblitz.com/headless 下载运行时，' +
                     '请检查网络后刷新重试。',
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
      await initWebContainer(WebContainer, options);
      if (!instance) throw new Error('WebContainer 初始化失败');
      return instance;
   })();

   try {
      return await bootingPromise;
   } finally {
      bootingPromise = null;
   }
};

export interface IExposedServer {
   port: number;
   url: string;
}

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

   const getInstance = async () => {
      if (!instance && released) {
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
      const [instance, { getParentPath, normalizePath }] = await Promise.all([
         getInstance(),
         import('~/utils/path-utils'),
      ]);

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
      const [instance, { normalizePath }] = await Promise.all([
         getInstance(),
         import('~/utils/path-utils'),
      ]);

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

   const runCommand = async (
      commandLine: string | string[],
      options?: { env?: Record<string, string> }
   ) => {
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
      // args 须作为第二个参数传入，放进 options 会被忽略
      return await instance.spawn(
         command,
         args,
         options?.env ? { env: options.env } : undefined
      );
   };

   /** 当前所有已就绪的服务（按就绪顺序） */
   const servers = ref<IExposedServer[]>([]);
   /** 主服务：固定为最先就绪的端口，后起的服务不会抢占；仅在其端口关闭后才让位 */
   const exposeServer = ref<IExposedServer>();
   const error = ref<{ message: string }>();
   const openedPort = ref<number>();
   const closePort = ref<number>();

   onMounted(async () => {
      try {
         const { WebContainer } = await import('@webcontainer/api');

         if (!instance || released) {
            await startBoot(WebContainer, options);
            webContainerReadyCallbacks.forEach((callback) => callback(instance!));
         }

         instance!.on('server-ready', (port, url) => {
            servers.value = [
               ...servers.value.filter((s) => s.port !== port),
               { port, url },
            ];
            if (!exposeServer.value || exposeServer.value.port === port) {
               exposeServer.value = { port, url };
            }
         });

         instance!.on('error', (err) => {
            error.value = err;
         });

         instance!.on('port', (port, type) => {
            if (type === 'open') {
               openedPort.value = port;
            } else {
               closePort.value = port;
               servers.value = servers.value.filter((s) => s.port !== port);
               if (exposeServer.value?.port === port) {
                  exposeServer.value = servers.value[0];
               }
            }
         });
      } catch (err: any) {
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
      servers,
      exposeServer,
      openedPort,
      closePort,
      error,
   };
};
