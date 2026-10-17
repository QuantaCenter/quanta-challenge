import { build } from 'esbuild'

// server: 自包含 CJS；sdk: 浏览器 IIFE
await Promise.all([
   build({
      entryPoints: ['src/server/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      outfile: 'dist/server.cjs',
      logLevel: 'info',
   }),
   build({
      entryPoints: ['src/sdk/index.ts'],
      bundle: true,
      platform: 'browser',
      target: 'es2020',
      format: 'iife',
      globalName: 'ObservationSDK',
      outfile: 'dist/observation-sdk.iife.js',
      logLevel: 'info',
   }),
])
