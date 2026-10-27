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
         // npm 依赖保持 external（运行期从 node_modules 加载）；须显式排除 Windows 绝对路径，否则入口被误判为裸模块名而报 "Entry module cannot be external"。
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
