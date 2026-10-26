import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  noExternal: [/.*/],
  // 打包进单文件的 CJS 依赖（pg 等）内部走动态 require；ESM 产物里没有原生
  // require，esbuild 的 shim 会抛 "Dynamic require of ... is not supported"。
  // 用 createRequire 提供真正的 require，shim 检测到后直接透传。
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
