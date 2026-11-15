import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
   filterProjectFiles,
   findProjectMatches,
   findNextProjectSearchMatch,
   listProjectFiles,
   replaceProjectSearchResults,
   searchProjectFiles,
   type ProjectSearchFs,
} from '../app/utils/project-search.ts';
import { buildSearchResultDocument } from '../app/utils/search-result-document.ts';
import { getFileIconPath } from '../app/components/st/FileSystemTree/config.ts';

test('next replacement follows columns, lines and files, wrapping after the last match', async () => {
   const result = await searchProjectFiles(filesystem({
      '/project/a.txt': 'hello hello\nhello',
      '/project/b.txt': 'hello',
   }), 'hello');
   const next = (path: string, line: number, column: number) =>
      findNextProjectSearchMatch(result, { path, line, column });
   assert.equal(findNextProjectSearchMatch(result)?.match.column, 1);
   assert.equal(next('/project/a.txt', 1, 6)?.match.column, 7);
   assert.equal(next('/project/a.txt', 1, 12)?.match.line, 2);
   assert.equal(next('/project/a.txt', 3, 1)?.group.path, '/project/b.txt');
   assert.equal(next('/project/b.txt', 1, 6)?.group.path, '/project/a.txt');
   assert.equal(findNextProjectSearchMatch({ groups: [], truncated: false, unreadable: 0 }), undefined);
});

test('single replacement preserves other matches and advances past inserted search text', async () => {
   const files = new Map([['/project/a.txt', 'hello hello']]);
   const search = () => searchProjectFiles(filesystem(Object.fromEntries(files)), 'hello');
   const io = {
      readFile: async (path: string) => files.get(path)!,
      writeFile: async (path: string, content: string) => { files.set(path, content); },
   };
   const result = await search();
   const first = findNextProjectSearchMatch(result)!;
   const summary = await replaceProjectSearchResults({
      ...result, groups: [{ ...first.group, matches: [first.match] }],
   }, 'hello!', io);
   assert.deepEqual(summary, { matches: 1, files: 1, skipped: 0, failed: 0 });
   assert.equal(files.get('/project/a.txt'), 'hello! hello');
   const refreshed = await search();
   const second = findNextProjectSearchMatch(refreshed, { path: first.group.path, line: 1, column: 7 })!;
   assert.equal(second.match.column, 8);
   await replaceProjectSearchResults({
      ...refreshed, groups: [{ ...second.group, matches: [second.match] }],
   }, '', io);
   assert.equal(files.get('/project/a.txt'), 'hello! ');
});

test('replaces literal matches across files while preserving CRLF, UTF-16 columns and dollar signs', async () => {
   const files = new Map([
      ['/project/a.txt', '🙂 Hello hello\r\nhello!'],
      ['/project/b.txt', 'HELLO'],
   ]);
   const result = await searchProjectFiles(filesystem(Object.fromEntries(files)), 'hello');
   const summary = await replaceProjectSearchResults(result, '$&', {
      readFile: async (path) => files.get(path)!,
      writeFile: async (path, content) => { files.set(path, content); },
   });
   assert.deepEqual(summary, { matches: 4, files: 2, skipped: 0, failed: 0 });
   assert.equal(files.get('/project/a.txt'), '🙂 $& $&\r\n$&!');
   assert.equal(files.get('/project/b.txt'), '$&');
});

test('replacement can delete matches and follows case and exclusion preferences', async () => {
   const files = new Map([
      ['/project/.gitignore', 'ignored.txt'],
      ['/project/a.txt', 'hello HELLO hello'],
      ['/project/ignored.txt', 'hello'],
      ['/project/extra.txt', 'hello'],
   ]);
   const result = await searchProjectFiles(filesystem(Object.fromEntries(files)), 'hello', {
      ignoreCase: false,
      excludePatterns: 'extra.txt',
   });
   const summary = await replaceProjectSearchResults(result, '', {
      readFile: async (path) => files.get(path)!,
      writeFile: async (path, content) => { files.set(path, content); },
   });
   assert.equal(summary.matches, 2);
   assert.equal(files.get('/project/a.txt'), ' HELLO ');
   assert.equal(files.get('/project/ignored.txt'), 'hello');
   assert.equal(files.get('/project/extra.txt'), 'hello');
});

test('replacement skips stale files and reports partial write failures without losing other changes', async () => {
   const files = new Map([
      ['/project/a.txt', 'hello'],
      ['/project/b.txt', 'hello'],
      ['/project/c.txt', 'hello'],
   ]);
   const result = await searchProjectFiles(filesystem(Object.fromEntries(files)), 'hello');
   files.set('/project/a.txt', 'hello edited');
   const summary = await replaceProjectSearchResults(result, 'world', {
      readFile: async (path) => files.get(path)!,
      writeFile: async (path, content) => {
         if (path === '/project/b.txt') throw new Error('Write failed');
         files.set(path, content);
      },
   });
   assert.deepEqual(summary, { matches: 1, files: 1, skipped: 1, failed: 1 });
   assert.equal(files.get('/project/a.txt'), 'hello edited');
   assert.equal(files.get('/project/b.txt'), 'hello');
   assert.equal(files.get('/project/c.txt'), 'world');
});

test('replacement uses unsaved source snapshots and refuses truncated search results', async () => {
   const fs = filesystem({ '/project/a.txt': 'saved' });
   const result = await searchProjectFiles(fs, 'hello', { getEditedContent: () => 'hello unsaved' });
   const writes: string[] = [];
   const io = {
      readFile: async () => 'hello unsaved',
      writeFile: async (_path: string, content: string) => { writes.push(content); },
   };
   assert.equal((await replaceProjectSearchResults(result, 'world', io)).matches, 1);
   assert.deepEqual(writes, ['world unsaved']);
   await assert.rejects(replaceProjectSearchResults({ ...result, truncated: true }, 'world', io));
   assert.equal(writes.length, 1);
});

const filesystem = (files: Record<string, string | Uint8Array>): ProjectSearchFs => ({
   async readdir(directory) {
      const entries = new Map<string, boolean>();
      for (const path of Object.keys(files)) {
         if (!path.startsWith(`${directory}/`)) continue;
         const parts = path.slice(directory.length + 1).split('/');
         entries.set(parts[0], parts.length > 1);
      }
      return [...entries].map(([name, directory]) => ({
         name,
         isDirectory: () => directory,
         isFile: () => !directory,
      }));
   },
   async readFile(path) {
      const content = files[path];
      if (content === undefined) throw new Error('File removed');
      return typeof content === 'string' ? new TextEncoder().encode(content) : content;
   },
});

test('walks unopened files, follows gitignore exclusions and skips git metadata', async () => {
   const fs = filesystem({
      '/project/.gitignore': 'node_modules/\ndist/\n',
      '/project/src/nested/index.ts': 'hello',
      '/project/.env.example': 'HELLO',
      '/project/node_modules/pkg/index.js': 'hello',
      '/project/.git/config': 'hello',
      '/project/dist/app.js': 'hello',
   });
   assert.deepEqual(await listProjectFiles(fs), ['/project/.env.example', '/project/.gitignore', '/project/src/nested/index.ts']);
   const result = await searchProjectFiles(fs, 'hello');
   assert.equal(result.groups.length, 2);
});

test('skips node_modules at every depth even without gitignore or with exclusions disabled', async () => {
   const fs = filesystem({
      '/project/src/index.ts': 'target',
      '/project/node_modules/pkg/index.js': 'target',
      '/project/packages/app/node_modules/pkg/index.js': 'target',
   });
   assert.deepEqual(await listProjectFiles(fs), ['/project/src/index.ts']);
   const result = await searchProjectFiles(fs, 'target', { respectGitignore: false });
   assert.deepEqual(result.groups.map((group) => group.path), ['/project/src/index.ts']);
});

test('matches literal punctuation and multiple occurrences with exact CRLF and UTF-16 positions', () => {
   const matches = findProjectMatches('prefix\r\n🙂 a.b A.B\r\nend', 'a.b');
   assert.deepEqual(matches.map(({ line, column, length, match }) => ({ line, column, length, match })), [
      { line: 2, column: 4, length: 3, match: 'a.b' },
      { line: 2, column: 8, length: 3, match: 'A.B' },
   ]);
   assert.equal(findProjectMatches('abc', '').length, 0);
   assert.equal(findProjectMatches('[x] $ ^ \\', '[x]').length, 1);
   assert.equal(findProjectMatches('aaa', 'a', 2).length, 2);
});

test('ranks filename hits before path hits and supports fuzzy path lookup', () => {
   const paths = ['/project/components/search/Button.vue', '/project/Search.vue', '/project/src/styles.css'];
   assert.deepEqual(filterProjectFiles(paths, 'search'), [paths[1], paths[0]]);
   assert.deepEqual(filterProjectFiles(paths, 's/s.css'), [paths[2]]);
   assert.deepEqual(filterProjectFiles(paths, 'missing'), []);
});

test('skips binary and invalid UTF-8, includes edited content, and reports truncation accurately', async () => {
   const fs = filesystem({
      '/project/a.txt': 'old',
      '/project/b.txt': 'target target',
      '/project/c.bin': new Uint8Array([0, 65]),
      '/project/d.bin': new Uint8Array([255, 254]),
   });
   const options = { getEditedContent: (path: string) => path.endsWith('/a.txt') ? 'target' : undefined };
   const result = await searchProjectFiles(fs, 'target', options);
   assert.equal(result.groups.length, 2);
   assert.equal(result.truncated, false);
   const limited = await searchProjectFiles(fs, 'target', { ...options, limit: 2 });
   assert.equal(limited.truncated, true);
   assert.equal(limited.groups.flatMap((group) => group.matches).length, 2);
   const exact = await searchProjectFiles(fs, 'target', { ...options, limit: 3 });
   assert.equal(exact.truncated, false);
});

test('cancels superseded searches and reports files that disappear during search', async () => {
   const fs = filesystem({ '/project/a.txt': 'target' });
   const controller = new AbortController();
   controller.abort();
   await assert.rejects(searchProjectFiles(fs, 'target', { signal: controller.signal }), { name: 'AbortError' });
   fs.readFile = async () => { throw new Error('removed'); };
   const result = await searchProjectFiles(fs, 'target');
   assert.equal(result.unreadable, 1);
   assert.equal(result.groups.length, 0);
});

test('builds native Monaco file folds and preserves original source line/column mappings', () => {
   const matches = findProjectMatches('first\r\n🙂 target target', 'target');
   const document = buildSearchResultDocument([
      { path: '/project/src/main.ts', matches },
      { path: '/project/app.vue', matches: matches.slice(0, 1) },
   ]);
   assert.deepEqual(document.folds, [{ start: 1, end: 3 }, { start: 5, end: 6 }]);
   assert.equal(document.headers.get(1), '/project/src/main.ts');
   assert.equal(document.headers.get(5), '/project/app.vue');
   assert.deepEqual(document.matches.get(3), { path: '/project/src/main.ts', match: matches[1] });
   assert.equal(document.matches.get(2)?.match.column, 4);
   assert.equal(document.matches.get(2)?.match.line, 2);
   assert.equal(document.text.split('\n')[1], '🙂 target target');
   assert.equal(buildSearchResultDocument([]).text, '');
});

test('retains more than 2000 results for the virtualized search editor', async () => {
   const fs = filesystem({ '/project/many.txt': 'target\n'.repeat(3000) });
   const result = await searchProjectFiles(fs, 'target');
   assert.equal(result.groups[0].matches.length, 3000);
   assert.equal(result.truncated, false);
});

test('uses explorer icon priorities for exact names, compound extensions and unknown files', () => {
   assert.equal(getFileIconPath('/project/package.json'), '/icons/nodejs.png');
   assert.equal(getFileIconPath('/project/types/env.d.ts'), '/icons/typescript-def.png');
   assert.equal(getFileIconPath('/project/App.vue'), '/icons/vue.png');
   assert.equal(getFileIconPath('/project/README.md'), '/icons/readme.png');
   assert.equal(getFileIconPath('/project/source.ts'), '/icons/typescript.png');
   assert.equal(getFileIconPath('/project/unknown.extension'), undefined);
});

test('case matching is configurable and defaults to ignoring case', async () => {
   const fs = filesystem({ '/project/a.ts': 'target TARGET Target' });
   const all = await searchProjectFiles(fs, 'target');
   const exact = await searchProjectFiles(fs, 'target', { ignoreCase: false });
   assert.equal(all.groups[0].matches.length, 3);
   assert.equal(exact.groups[0].matches.length, 1);
});

test('respects root gitignore directory, negation, anchored and case-sensitive patterns', async () => {
   const fs = filesystem({
      '/project/.gitignore': 'build/\n*.log\n!important.log\n/root.txt\nCase.txt\n',
      '/project/build/output.ts': 'target',
      '/project/debug.log': 'target',
      '/project/important.log': 'target',
      '/project/root.txt': 'target',
      '/project/nested/root.txt': 'target',
      '/project/Case.txt': 'target',
      '/project/case.txt': 'target',
      '/project/plain.ts': 'target',
   });
   const result = await searchProjectFiles(fs, 'target');
   assert.deepEqual(result.groups.map((group) => group.path), [
      '/project/case.txt', '/project/important.log', '/project/nested/root.txt', '/project/plain.ts',
   ]);
   const unfiltered = await searchProjectFiles(fs, 'target', { respectGitignore: false });
   assert.equal(unfiltered.groups.length, 8);
   const extra = await searchProjectFiles(fs, 'target', { excludePatterns: '*.ts\nnested/' });
   assert.deepEqual(extra.groups.map((group) => group.path), ['/project/case.txt', '/project/important.log']);
});

test('does not invent exclusions when the working directory has no gitignore', async () => {
   const fs = filesystem({ '/project/dist/source.ts': 'target', '/project/.git/config': 'target' });
   assert.deepEqual(await listProjectFiles(fs), ['/project/dist/source.ts']);
});

test('shows source context, merges windows and keeps every hit on the same source line', () => {
   const lines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
   lines[3] = 'target + target';
   lines[5] = 'TARGET';
   lines[16] = 'target';
   const source = lines.join('\r\n');
   const matches = findProjectMatches(source, 'target');
   const document = buildSearchResultDocument([{ path: '/project/source.ts', source, matches }]);
   assert.deepEqual([...document.rows.values()].map((row) => row.sourceLine), [
      2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 19,
   ]);
   const sameLine = [...document.rows.values()].filter((row) => row.sourceLine === 4);
   assert.equal(sameLine.length, 1);
   assert.deepEqual(sameLine[0].hits.map((hit) => hit.column), [1, 10]);
   assert.equal(document.text.split('\n').filter((line) => line === '⋯').length, 1);
});

test('source context uses original columns rather than clipped snippet columns', () => {
   const source = `${' '.repeat(200)}target`;
   const matches = findProjectMatches(source, 'target');
   const document = buildSearchResultDocument([{ path: '/project/source.ts', source, matches }]);
   assert.equal(document.rows.get(2)?.hits[0].column, 201);
   assert.equal(document.text.split('\n')[1], source);
});
