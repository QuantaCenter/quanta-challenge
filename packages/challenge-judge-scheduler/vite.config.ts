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
         // external 两条规则：1) 排除 Windows 绝对路径（会被误判为裸模块名，入口自身被判 external）；2) @challenge/* workspace 包指向无扩展名导入的 TS 源码，须打包进产物而非 external。
         external: (id) =>
            !id.startsWith('.') &&
            !id.startsWith('/') &&
            !/^[A-Za-z]:[\\/]/.test(id) &&
            !id.startsWith('@challenge/'),
      },
   },
   ssr: {
      noExternal: [/@challenge\/.*/],
      external: ['ssh2'],
   },
   server: {
      port: 1888,
   },
});
