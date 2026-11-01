import type { WebContainer } from '@webcontainer/api';
import type * as monaco from 'monaco-editor';

const MANIFEST_NAMES = new Set([
   'package.json',
   'pnpm-lock.yaml',
   'package-lock.json',
   'yarn.lock',
]);

interface IUseManifestSyncOptions {
   getWebContainerInstance: () => Promise<WebContainer>;
   onEditorInstanceReady: (
      callback: (
         instance: monaco.editor.IStandaloneCodeEditor,
         monaco: typeof import('monaco-editor')
      ) => void
   ) => void;
}

/**
 * 把容器里被 npm / pnpm / yarn 改写的 package.json 与锁文件同步回编辑器模型。
 *
 * · Volar worker 只能从模型读到依赖清单，模型不更新，装包 / 删包后类型不会变化；
 * · 编辑器的修改会把整份模型写回容器，模型停留在旧内容时，下一次编辑会把新装的依赖覆盖掉。
 *
 * 同步后的模型变更会照常写回容器，内容相同，再次触发的监听读到一致内容后即停止。
 */
export const useManifestSync = (options: IUseManifestSyncOptions) => {
   const { getWebContainerInstance, onEditorInstanceReady } = options;
   const timers = new Map<string, ReturnType<typeof setTimeout>>();
   let watcher: { close(): void } | undefined;
   let disposed = false;

   const syncFile = async (path: string) => {
      const wc = await getWebContainerInstance();
      let content: string | undefined;
      try {
         content = await wc.fs.readFile(path, 'utf-8');
      } catch {
         content = undefined;
      }

      onEditorInstanceReady((_, monaco) => {
         const uri = monaco.Uri.file(`/${path}`);
         const model = monaco.editor.getModel(uri);
         if (content === undefined) {
            if (model && !model.isAttachedToEditor()) model.dispose();
            return;
         }
         if (!model) {
            monaco.editor.createModel(content, undefined, uri);
            return;
         }
         if (model.getValue() === content) return;
         model.pushEditOperations(
            [],
            [{ range: model.getFullModelRange(), text: content }],
            () => null
         );
      });
   };

   const schedule = (path: string) => {
      clearTimeout(timers.get(path));
      timers.set(
         path,
         setTimeout(() => {
            timers.delete(path);
            syncFile(path).catch((error) =>
               console.warn('[manifest-sync] 同步失败', path, error)
            );
         }, 300)
      );
   };

   onMounted(async () => {
      const wc = await getWebContainerInstance();
      if (disposed) return;
      watcher = wc.fs.watch('/', { recursive: true }, (_, filename) => {
         const path = (
            typeof filename === 'string'
               ? filename
               : new TextDecoder().decode(filename)
         ).replace(/^\/+/, '');
         if (path.includes('node_modules/')) return;
         if (!MANIFEST_NAMES.has(path.slice(path.lastIndexOf('/') + 1))) return;
         schedule(path);
      });
   });

   onUnmounted(() => {
      disposed = true;
      watcher?.close();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
   });
};
