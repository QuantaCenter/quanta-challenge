import { cp, mkdir } from 'node:fs/promises';

import { build } from 'esbuild';
import { defineConfig } from 'tsup';
import { DTS_FILES } from './src/domain/agent-docs';

/** `qpc agent dts` 的真源在 Web 应用（编辑器用同一份），随包分发需拷进 dist。 */
const DTS_SOURCE = '../challenge-web-app/public';

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
   skipNodeModulesBundle: true,
   noExternal: [/^@challenge\//],
   onSuccess: async () => {
      await build({
         entryPoints: ['../challenge-cloud-function/src/runtime/worker.ts'],
         outfile: 'dist/cloud-function-worker.cjs',
         bundle: true,
         platform: 'node',
         format: 'cjs',
         target: 'node20',
      });
      await mkdir('dist/agent-types', { recursive: true });
      for (const file of Object.values(DTS_FILES)) {
         await cp(`${DTS_SOURCE}/${file}`, `dist/agent-types/${file}`);
      }
   },
});
