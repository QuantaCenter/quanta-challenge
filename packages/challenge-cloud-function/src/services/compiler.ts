import { build, type Plugin } from 'esbuild';
import { fail } from '../utils/errors';

/**
 * 禁止引用任何外部模块（node 内置 / npm 包）。
 *
 * 云函数只允许"单文件、零依赖"：需要外部能力的场景由平台通过 `ctx` 提供受控能力，
 * 而不是放开沙箱。这里用 esbuild 的 onResolve 在**构建期**拦下裸模块名——
 * 比事后用正则扫产物可靠（不会把字符串字面量里的 `require("fs")` 误判）。
 *
 * 注意一个无害的边界：esbuild 会把"未被使用的 import"直接 elide（连解析都不做），
 * 所以 `import fs from 'node:fs'` 但从不引用 `fs` 时不会触发本插件。这没有问题——
 * import 被丢弃后并不会产生任何可执行代码。只要真正**用到**（或写成副作用导入），
 * onResolve 就会命中并被拦下。
 *
 * 相对/绝对路径 import 会继续被 esbuild 打包进来（属于同一份源码）。
 */
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

/**
 * 把 TS/JS 源码编译成单文件 CJS 产物。
 *
 * 在**发布期**执行，调用路径上不再编译（避免冷启动抖动）。
 */
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
