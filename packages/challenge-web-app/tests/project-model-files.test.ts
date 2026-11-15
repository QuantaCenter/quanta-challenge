import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProjectModelPaths } from '../app/utils/project-model-files.ts';
import { IGNORE_FILE_PATTERNS } from '../app/pages/challenge/_subpages/editor/_configs/index.ts';

test('includes unopened source files while excluding dependencies and configured output paths', () => {
   const paths = [
      '/project/src/main.ts',
      '/project/src/components/App.vue',
      '/project/package.json',
      '/project/.env',
      '/project/node_modules/vue/index.js',
      '/project/packages/demo/node_modules/lib/index.ts',
      '/project/.git/config',
      '/project/dist/main.js',
      '/project/packages/demo/dist/main.js',
      '/project/.cache/result.json',
      '/project/.vite/manifest.json',
      '/project/.quanta/config.json',
      '/project/yarn.lock',
   ];
   assert.deepEqual(getProjectModelPaths(paths, '', IGNORE_FILE_PATTERNS), paths.slice(0, 4));
});

test('honors project gitignore rules, anchored paths and negated file patterns', () => {
   const paths = [
      '/project/src/main.ts',
      '/project/src/main.generated.ts',
      '/project/src/keep.generated.ts',
      '/project/output/result.ts',
      '/project/src/output/result.ts',
   ];
   assert.deepEqual(getProjectModelPaths(paths, [
      '*.generated.ts',
      '!keep.generated.ts',
      '/output/',
   ].join('\n'), []), [paths[0], paths[2], paths[4]]);
});

test('gitignore negations cannot reinclude dependencies or configured ignores', () => {
   assert.deepEqual(getProjectModelPaths([
      '/project/node_modules/vue/index.js',
      '/project/.git/config',
      '/project/dist/index.js',
   ], '!node_modules/\n!.git/\n!dist/\n!*', IGNORE_FILE_PATTERNS), []);
});

test('normalizes project paths and excludes files outside the project', () => {
   assert.deepEqual(getProjectModelPaths([
      'project/src/main.ts',
      '/project/node_modules-tools/index.ts',
      '/project/src/distribution.ts',
      '/project',
      '/project-other/index.ts',
   ], '', IGNORE_FILE_PATTERNS), [
      '/project/src/main.ts',
      '/project/node_modules-tools/index.ts',
      '/project/src/distribution.ts',
   ]);
});
