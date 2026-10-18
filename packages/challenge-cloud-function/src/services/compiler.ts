import { build, type Plugin } from 'esbuild';
import { fail } from '../utils/errors';

/** 禁止引用任何外部模块：云函数只允许单文件、零依赖；用 esbuild onResolve 在构建期拦下裸模块名（未被使用的 import 会被 elide，无碍）。 */
const denyExternalPlugin: Plugin = {
   name: 'deny-external-modules',
   setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
         // 入口（stdin）没有 importer，放行。
         if (args.importer === '') return null;
         if (args.path.startsWith('.') || args.path.startsWith('/')) return null;
         return {
            errors: [
               {
                  text: `禁止引用外部模块「${args.path}」。云函数必须自包含，不能依赖 node 内置或 npm 包。`,
               },
            ],
         };
      });
   },
};

export interface CompileResult {
   code: string;
   bytes: number;
}

/** 把 TS/JS 源码编译成单文件 CJS 产物（发布期执行，避免冷启动抖动）。 */
export const compileFunction = async (
   source: string,
   name: string,
): Promise<CompileResult> => {
   let output: Awaited<ReturnType<typeof build>>;
   try {
      output = await build({
         stdin: {
            contents: source,
            loader: 'ts',
            sourcefile: `${name}.ts`,
            resolveDir: process.cwd(),
         },
         bundle: true,
         write: false,
         format: 'cjs',
         platform: 'node',
         target: 'node20',
         minify: false,
         sourcemap: false,
         legalComments: 'none',
         logLevel: 'silent',
         plugins: [denyExternalPlugin],
      });
   } catch (error) {
      const messages =
         (error as { errors?: { text: string }[] })?.errors
            ?.map((item) => item.text)
            .join('；') ?? (error instanceof Error ? error.message : String(error));
      fail('COMPILE_ERROR', `编译失败：${messages}`);
   }

   const file = output.outputFiles?.[0];
   if (!file) {
      fail('COMPILE_ERROR', '编译未产生任何产物');
   }

   return { code: file.text, bytes: Buffer.byteLength(file.text, 'utf8') };
};
