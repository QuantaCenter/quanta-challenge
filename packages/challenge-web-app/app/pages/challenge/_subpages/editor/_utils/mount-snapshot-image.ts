import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import {
   deleteCachedSnapshotImage,
   readCachedSnapshotImage,
   writeCachedSnapshotImage,
} from './snapshot-image-cache';

/** 快照镜像的必要信息（来自 ImageBuild 表） */
export interface ISnapshotImageInfo {
   id: string;
   name: string;
   status: string;
   fileName: string | null;
   formatVersion: number;
   sizeBytes: number | null;
}

interface IMountSnapshotImageOptions {
   build: ISnapshotImageInfo;
   getInstance: () => Promise<WebContainer>;
   runCommand: (command: string[]) => Promise<WebContainerProcess>;
   /** 带登录态的 fetch */
   fetcher: (url: string) => Promise<Response>;
   /** 启动步骤文案（下载进度 / 读取缓存） */
   onProgress?: (text: string) => void;
   /** 写入终端的日志 */
   log?: (text: string) => unknown;
   /** 错误提示用语：谁绑定了快照镜像、出错时联系谁 */
   owner: string;
   contact: string;
   /** console 日志前缀 */
   scope: string;
}

const download = async (
   fetcher: IMountSnapshotImageOptions['fetcher'],
   fileName: string,
   expectedSize: number | null,
   onProgress?: (text: string) => void,
) => {
   const response = await fetcher(
      `/api/static/image-builds/${encodeURIComponent(fileName)}`,
   );
   if (!response.ok) {
      throw new Error(`快照镜像下载失败（HTTP ${response.status}）`);
   }
   // 响应带 Content-Encoding，读到的是解压后的字节，进度按原始大小计算
   if (!response.body || !expectedSize) {
      return new Uint8Array(await response.arrayBuffer());
   }
   const reader = response.body.getReader();
   const chunks: Uint8Array[] = [];
   let received = 0;
   for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      const percent = Math.min(99, Math.floor((received / expectedSize) * 100));
      onProgress?.(`正在拉取快照镜像... ${percent}%`);
   }
   const bytes = new Uint8Array(received);
   let offset = 0;
   for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
   }
   return bytes;
};

/**
 * 校验快照镜像可用后挂载到 WebContainer 工作区根（优先使用 IndexedDB 缓存，缓存损坏时重新下载），
 * 挂载后恢复 node_modules/.bin 的执行权限。返回挂载的字节数。
 */
export const mountSnapshotImage = async (
   options: IMountSnapshotImageOptions,
): Promise<number> => {
   const { build, owner, contact, onProgress, log } = options;
   if (build.formatVersion !== 0) {
      throw new Error(
         `快照镜像「${build.name}」需要使用 WebContainer 重新构建，请联系${contact}`,
      );
   }
   if (build.status !== 'ready' || !build.fileName) {
      throw new Error(
         `${owner}绑定的快照镜像「${build.name}」尚未构建完成，请联系${contact}`,
      );
   }
   const { id, name, sizeBytes } = build;
   const fileName = build.fileName;
   const instance = await options.getInstance();

   const mount = async (fromCache: boolean): Promise<number> => {
      let bytes: Uint8Array<ArrayBuffer> | null = null;
      if (fromCache) {
         bytes = await readCachedSnapshotImage(fileName);
         if (bytes && sizeBytes && bytes.byteLength !== sizeBytes) {
            await deleteCachedSnapshotImage(fileName);
            bytes = null;
         }
         if (!bytes) return -1;
         onProgress?.('正在读取缓存...');
         await log?.(`[image] 命中本地缓存「${name}」\n`);
      } else {
         onProgress?.('正在拉取快照镜像...');
         await log?.(`[image] 正在拉取快照镜像「${name}」…\n`);
         bytes = await download(options.fetcher, fileName, sizeBytes, onProgress);
         if (bytes.byteLength === 0) {
            throw new Error(`快照镜像「${name}」内容为空，请联系${contact}重新上传`);
         }
      }
      const size = bytes.byteLength;
      // mount 会转移 buffer，需在此之前复制出要缓存的内容
      const cacheBlob = fromCache ? null : new Blob([bytes]);
      await instance.mount(bytes);
      if (cacheBlob) void writeCachedSnapshotImage(id, fileName, cacheBlob);
      return size;
   };

   let size = -1;
   try {
      size = await mount(true);
   } catch (error) {
      console.warn(`[${options.scope}] 缓存的快照镜像挂载失败，改为重新下载:`, error);
      await deleteCachedSnapshotImage(fileName);
   }
   if (size < 0) {
      try {
         size = await mount(false);
      } catch (error: any) {
         throw new Error(`快照镜像「${name}」加载失败：${error?.message ?? error}`);
      }
   }

   // snapshot 不保留执行权限
   const fix = await options.runCommand([
      'sh',
      '-c',
      'chmod +x node_modules/.bin/* 2>/dev/null; true',
   ]);
   await fix.exit;
   await log?.(
      `[image] 快照镜像已就绪（${(size / 1024 / 1024).toFixed(1)} MB）\n`,
   );
   return size;
};
