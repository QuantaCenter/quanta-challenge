import { defineConfig } from 'tsup';

/** 构建产物：index.js = bin 入口（shebang 在 src/index.ts），program.js = 纯函数入口；两个入口必须分开，否则 jiti 加载配置时会顺手跑一遍 CLI。 */
export default defineConfig({
   entry: {
      index: 'src/index.ts',
      program: 'src/program.ts',
   },
   format: ['esm'],
   platform: 'node',
   target: 'node20',
   outDir: 'dist',
   clean: true,
   dts: true,
   sourcemap: true,
   splitting: false,
   treeshake: true,
   // 依赖全部保持 external：CLI 以 workspace 包形式安装，node_modules 始终可用。
   skipNodeModulesBundle: true,
});
