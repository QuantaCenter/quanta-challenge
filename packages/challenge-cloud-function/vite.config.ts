import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import devServer from '@hono/vite-dev-server';

const entry = (relative: string) =>
   fileURLToPath(new URL(relative, import.meta.url));

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
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
         // 两个入口：
         //  - index          服务本体
         //  - runtime/worker 沙箱 Worker。它**不是**通过 import 引用的（我们只在运行时
         //    用文件路径去 spawn），所以必须显式列为构建入口，否则产物里根本没有这个文件，
         //    生产环境启动时找不到 worker 源码。
         input: {
            index: entry('./src/index.ts'),
            'runtime/worker': entry('./src/runtime/worker.ts'),
         },
         output: {
            preserveModules: true,
            preserveModulesRoot: 'src',
            entryFileNames: '[name].js',
            format: 'esm',
         },
         // external 规则与 judge-scheduler 保持一致（原因见那边的注释）：
         // 排除 Windows 绝对路径与 @challenge/*（后者 exports 指向 TS 源码，必须打包进来）。
         external: (id) =>
            !id.startsWith('.') &&
            !id.startsWith('/') &&
            !/^[A-Za-z]:[\\/]/.test(id) &&
            !id.startsWith('@challenge/'),
      },
   },
   ssr: {
      noExternal: [/@challenge\/.*/],
   },
   server: {
      port: 1890,
   },
});
