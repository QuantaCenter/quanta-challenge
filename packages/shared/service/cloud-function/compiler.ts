import { build, type Plugin } from 'esbuild';
import { fail } from './errors';

/** 云函数只允许单文件、零依赖。 */
const denyExternalPlugin: Plugin = {
   name: 'deny-external-modules',
   setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
         // 入口（stdin）没有 importer，放行。
         if (args.kind === 'entry-point') return null;
         return {
            errors: [
               {
                  text: `禁止引用外部模块「${args.path}」。云函数必须使用单个自包含的文件。`,
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
