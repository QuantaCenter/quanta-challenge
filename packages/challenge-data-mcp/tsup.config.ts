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
});
