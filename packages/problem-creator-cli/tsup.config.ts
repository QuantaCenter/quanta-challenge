import { defineConfig } from 'tsup';

/**
 * 构建产物说明
 *
 * · `index.js`  —— bin 入口，带 shebang（写在 src/index.ts 第一行，esbuild 会保留）。
 * · `program.js` —— 纯函数入口，导出 `defineProblemConfig` 与全部类型，
 *                  供 `problem.config.ts` 里的 `import { defineProblemConfig }` 使用。
 *
 * 两个入口必须**分开**：jiti 在加载用户配置文件时会以模块 URL 的方式 import
 * `program.js`，如果它和 bin 入口是同一个文件，加载配置就会顺手把 CLI 跑一遍。
 */
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
