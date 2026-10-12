import { defineConfig } from 'vite';
import devServer from '@hono/vite-dev-server';

export default defineConfig({
   plugins: [
      devServer({
         entry: 'src/index.ts',
      }),
   ],
   build: {
      sourcemap: true,
      ssr: true,
      target: 'esnext',
      lib: {
         entry: 'src/index.ts',
         formats: ['es'],
         fileName: 'index',
      },
      rollupOptions: {
         output: {
            preserveModules: true,
            preserveModulesRoot: 'src',
            entryFileNames: '[name].js',
            format: 'esm',
         },
         // 把 npm 依赖保持为外部引用（运行期从 node_modules 加载），只打包 src 下的代码。
         //
         // 必须显式排除 Windows 绝对路径：Vite 传给 external 的 id 对入口来说是
         // **绝对路径**（如 F:\repo\packages\...\src\index.ts），而 Windows 路径既不
         // 以 '.' 也不以 '/' 开头，会被误判为裸模块名，导致入口自身被判成 external，
         // Rollup 直接报 "Entry module cannot be external" —— 构建彻底失败。
         // Linux/macOS 的绝对路径以 '/' 开头，所以该 bug 只在 Windows 上必现。
         external: (id) =>
            !id.startsWith('.') &&
            !id.startsWith('/') &&
            !/^[A-Za-z]:[\\/]/.test(id),
      },
   },
   server: {
      port: 3000,
   },
});
