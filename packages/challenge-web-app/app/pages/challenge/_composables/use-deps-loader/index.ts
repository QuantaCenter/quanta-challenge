import type { WebContainer } from '@webcontainer/api';

export interface IUseDepsLoaderOptions {
   getInstance: () => Promise<WebContainer> | WebContainer;
   moduleBase: string;
}

export const useDepsLoader = (options: IUseDepsLoaderOptions) => {
   const instancePromise = Promise.try(options.getInstance);
   const nodeModulesBase = `${options.moduleBase}/node_modules`;

   const load = async () => {
      const instance = await instancePromise;
      const result: Record<string, string> = {};

      const traverseInNextIdleCallback = async (
         dirPath: string = nodeModulesBase
      ) => {
         return await new Promise((resolve) =>
            requestIdleCallback(
               async (deadline) => {
                  await traverse(dirPath, deadline);
                  resolve(null);
               },
               { timeout: 1000 }
            )
         );
      };

      const traverse = async (
         dirPath = nodeModulesBase,
         deadline: IdleDeadline
      ) => {
         const dir = await instance.fs.readdir(dirPath, {
            withFileTypes: true,
         });
         for (const item of dir) {
            const itemPath = `${dirPath}/${item.name}`;
            if (item.isDirectory()) {
               if (deadline.timeRemaining() < 1) {
                  await traverseInNextIdleCallback(itemPath);
               } else {
                  await traverse(itemPath, deadline);
               }
            } else {
               const content = await instance.fs.readFile(itemPath, 'utf-8');
               const path = `${dirPath}/${item.name}`;
               result[path] = content;
            }
         }
      };

      await traverseInNextIdleCallback();
      return result;
   };

   return { load };
};
