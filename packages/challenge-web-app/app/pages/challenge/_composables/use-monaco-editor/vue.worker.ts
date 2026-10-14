import { createNpmFileSystem } from '@volar/jsdelivr';
import { createTypeScriptWorkerLanguageService } from '@volar/monaco/worker';
import {
   createVueLanguagePlugin,
   getFullLanguageServicePlugins,
   resolveVueCompilerOptions,
} from '@vue/language-service';
import { initialize } from 'monaco-editor/esm/vs/editor/editor.worker';
import typescript, {
   type CompilerOptions,
   getDefaultCompilerOptions,
   ModuleKind,
   ModuleResolutionKind,
   ScriptTarget,
} from 'typescript';
import { URI } from 'vscode-uri';
import { createHtmlLanguagePlugin } from './html-language-plugin';

import type { FileSystem, LanguageServiceEnvironment } from '@volar/monaco/worker';
import type * as monaco from 'monaco-editor';

// lib.*.d.ts 必须与本地 typescript 同版本：CDN 上的 typescript@latest（7.x）已不再附带这些文件
const tsLibLoaders = import.meta.glob<string>(
   '../../../../../node_modules/typescript/lib/lib.*.d.ts',
   { query: '?raw', import: 'default', exhaustive: true }
);
const tsLibs = new Map(
   Object.entries(tsLibLoaders).map(([path, load]) => [
      path.slice(path.lastIndexOf('/') + 1),
      load,
   ])
);

const TS_PACKAGE_DIR = '/node_modules/typescript';
const TS_LIB_DIR = `${TS_PACKAGE_DIR}/lib`;

const createFileSystem = (): FileSystem => {
   const npmFs = createNpmFileSystem();
   const isTsPath = (uri: URI) =>
      uri.path === TS_PACKAGE_DIR || uri.path.startsWith(`${TS_PACKAGE_DIR}/`);
   const getLibName = (uri: URI) =>
      uri.path.startsWith(`${TS_LIB_DIR}/`)
         ? uri.path.slice(TS_LIB_DIR.length + 1)
         : undefined;

   return {
      stat(uri) {
         if (!isTsPath(uri)) return npmFs.stat(uri);
         if (uri.path === TS_PACKAGE_DIR || uri.path === TS_LIB_DIR) {
            return { type: 2, ctime: -1, mtime: -1, size: -1 };
         }
         const libName = getLibName(uri);
         if (libName && tsLibs.has(libName)) {
            return { type: 1, ctime: -1, mtime: -1, size: -1 };
         }
      },
      readFile(uri) {
         if (!isTsPath(uri)) return npmFs.readFile(uri);
         const libName = getLibName(uri);
         return libName ? tsLibs.get(libName)?.() : undefined;
      },
      readDirectory(uri) {
         if (!isTsPath(uri)) return npmFs.readDirectory(uri);
         if (uri.path !== TS_LIB_DIR) return [];
         return [...tsLibs.keys()].map((name) => [name, 1]);
      },
   };
};

self.onmessage = () => {
   initialize((ctx: monaco.worker.IWorkerContext) => {
      const env: LanguageServiceEnvironment = {
         workspaceFolders: [URI.file('/')],
         fs: createFileSystem(),
      };
      const asUri = (fileName: string) => URI.file(fileName);
      const asFileName = (uri: URI) => uri.fsPath;

      const compilerOptions = {
         ...getDefaultCompilerOptions(),
         target: ScriptTarget.ES2020,
         module: ModuleKind.ESNext,
         moduleResolution: ModuleResolutionKind.Bundler,
         allowJs: true,
         strict: true,
      } satisfies CompilerOptions;
      const vueCompilerOptions = resolveVueCompilerOptions({});

      const languageService = createTypeScriptWorkerLanguageService({
         typescript,
         env,
         compilerOptions,
         uriConverter: { asFileName, asUri },
         workerContext: ctx,
         languagePlugins: [
            createVueLanguagePlugin(
               typescript,
               compilerOptions,
               vueCompilerOptions,
               asFileName
            ),
            createHtmlLanguagePlugin(typescript),
         ],
         languageServicePlugins: [...getFullLanguageServicePlugins(typescript)],
         // Vue 的模板 / HTML 补全等插件依赖 project.vue，缺失时会直接跳过
         setup: ({ project }) => {
            project.vue = { compilerOptions: vueCompilerOptions };
         },
      });

      return languageService;
   });
};
