import {
   createTypeScriptWorkerLanguageService,
   WorkerLanguageService,
} from '@volar/monaco/worker';
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
import {
   createManifestDigest,
   createProjectNpmFileSystem,
   type ProjectFile,
} from './project-npm-fs';

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

const createFileSystem = (projectFiles: ProjectFile[]): FileSystem => {
   const npmFs = createProjectNpmFileSystem(projectFiles);
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

const createLanguageService = (ctx: monaco.worker.IWorkerContext) => {
   const env: LanguageServiceEnvironment = {
      workspaceFolders: [URI.file('/')],
      fs: createFileSystem(ctx.getMirrorModels()),
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

   return createTypeScriptWorkerLanguageService({
      typescript,
      env,
      compilerOptions,
      uriConverter: { asFileName, asUri },
      workerContext: ctx,
      // html 插件必须排在 Vue 前面：Vue 会把所有 html 文件当作 petite-vue 模板解析，
      // 导致 hover 重复、出现 Vue 指令补全，<script> 也被当成 TS 检查
      languagePlugins: [
         createHtmlLanguagePlugin(typescript),
         createVueLanguagePlugin(
            typescript,
            compilerOptions,
            vueCompilerOptions,
            asFileName
         ),
      ],
      languageServicePlugins: [...getFullLanguageServicePlugins(typescript)],
      // Vue 的模板 / HTML 补全等插件依赖 project.vue，缺失时会直接跳过
      setup: ({ project }) => {
         project.vue = { compilerOptions: vueCompilerOptions };
      },
   });
};

/** 依赖清单（package.json / 锁文件）变化后整体重建语言服务（Volar 的 TS 宿主永久缓存文件读取结果，无法增量刷新）；逐个转发方法以生成主线程代理，按摘要判断是否重建。 */
const createReloadableLanguageService = (ctx: monaco.worker.IWorkerContext) => {
   const getManifestDigest = createManifestDigest();
   let digest: string | undefined;
   let service: WorkerLanguageService | undefined;

   const getService = () => {
      const next = getManifestDigest(ctx.getMirrorModels());
      if (!service || next !== digest) {
         service?.dispose();
         digest = next;
         service = createLanguageService(ctx);
      }
      return service;
   };

   const methods: Record<string, (...args: unknown[]) => unknown> = {};
   for (const name of Object.getOwnPropertyNames(WorkerLanguageService.prototype)) {
      if (name === 'constructor') continue;
      methods[name] = (...args) => {
         const current = getService() as unknown as Record<
            string,
            (...args: unknown[]) => unknown
         >;
         return current[name]!(...args);
      };
   }
   return methods;
};

self.onmessage = () => {
   initialize(createReloadableLanguageService);
};
