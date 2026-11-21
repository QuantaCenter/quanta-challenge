import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { runCli } from '../src/cli';
import { createProcessRuntime } from '../src/core/runtime';
import { problemConfigSchema } from '../src/domain/problem-config-schema';
import type { FetchLike } from '../src/services/http';

const temporaryDirectory = async (t: TestContext) => {
   const dir = await mkdtemp(join(tmpdir(), 'qpc-cloud-function-'));
   t.after(() => rm(dir, { recursive: true, force: true }));
   return dir;
};

const run = async (dir: string, args: string[], fetch: FetchLike) => {
   const stdout: string[] = [];
   const stderr: string[] = [];
   const exitCode = await runCli(
      ['node', 'qpc', ...args, '--json'],
      createProcessRuntime({
         cwd: dir,
         env: { QUANTA_CONFIG_DIR: dir, QUANTA_TOKEN: 'test-token' },
         fetch,
         stdout: (chunk) => stdout.push(chunk),
         stderr: (chunk) => stderr.push(chunk),
      }),
   );
   assert.equal(exitCode, 0, stderr.join(''));
   assert.equal(stdout.length, 1);
   return JSON.parse(stdout[0]!);
};

const response = (data: unknown) => Response.json({ result: { data } });

test('publishes local cloud function source and honors activation flags', async (t) => {
   const dir = await temporaryDirectory(t);
   const source = 'export default () => ({ total: 0 });\n';
   await writeFile(join(dir, 'total.ts'), source);
   const cases = [
      {
         args: ['--description', 'Cart'],
         options: { description: 'Cart', activate: true },
      },
      { args: ['--no-activate'], options: { activate: false } },
   ];
   for (const { args, options } of cases) {
      const result = {
         name: 'cart-total',
         version: 1,
         versionId: 'version-1',
         activated: options.activate,
         reused: false,
         created: true,
         compiledBytes: 32,
      };
      const output = await run(
         dir,
         ['cloud-function', 'publish', 'cart-total', 'total.ts', ...args],
         async (url, init) => {
            assert.equal(
               new URL(url).pathname,
               '/api/trpc/admin.cloudFunction.publish',
            );
            assert.equal(init?.method, 'POST');
            assert.deepEqual(JSON.parse(String(init?.body)), {
               name: 'cart-total',
               source,
               ...options,
            });
            return response(result);
         },
      );
      assert.deepEqual(output, result);
   }
});

test('problem publish distinguishes setting, clearing and preserving a binding', async (t) => {
   const dir = await temporaryDirectory(t);
   const cases = [
      { args: ['--cloud-function', 'cart-total'], name: 'cart-total' },
      { args: ['--clear-cloud-function'], name: null },
      { args: [], name: undefined },
   ];
   for (const { args, name } of cases) {
      const output = await run(
         dir,
         ['publish', '123', ...args],
         async (url, init) => {
            const path = new URL(url).pathname;
            if (path === '/api/trpc/admin.problem.getAuditDetail') {
               return response({
                  title: 'Cart',
                  status: 'ready',
                  cloudFunctionName: 'existing-function',
                  BaseProblem: { currentPid: 123 },
               });
            }
            assert.equal(path, '/api/trpc/admin.problem.setStatus');
            assert.deepEqual(JSON.parse(String(init?.body)), {
               problemId: 123,
               publish: true,
               ...(name !== undefined ? { cloudFunctionName: name } : {}),
            });
            return response({
               message: 'Published',
               cloudFunctionName:
                  name === undefined ? 'existing-function' : name,
            });
         },
      );
      assert.equal(
         output.cloudFunctionName,
         name === undefined ? 'existing-function' : name,
      );
   }
});

test('validates explicit cloud function bindings in problem configs', () => {
   const config = { title: 'Cart', difficulty: 'easy', tagIds: [1] };
   assert.equal(
      problemConfigSchema.parse({ ...config, cloudFunctionName: 'cart-total' })
         .cloudFunctionName,
      'cart-total',
   );
   assert.equal(
      problemConfigSchema.parse({ ...config, cloudFunctionName: null })
         .cloudFunctionName,
      null,
   );
   assert.equal(
      problemConfigSchema.safeParse({
         ...config,
         cloudFunctionName: 'CartTotal',
      }).success,
      false,
   );
   assert.equal(
      problemConfigSchema.safeParse({
         ...config,
         type: 'backend_service',
         cloudFunctionName: 'cart-total',
      }).success,
      false,
   );
});

test('problem upload includes the binding from its config', async (t) => {
   const dir = await temporaryDirectory(t);
   const example = new URL('../examples/hello-total/', import.meta.url);
   for (const file of ['answer', 'template', 'judge.js']) {
      await cp(new URL(file, example), join(dir, file), { recursive: true });
   }
   await writeFile(
      join(dir, 'problem.config.json'),
      JSON.stringify({
         title: 'Cart',
         detail: 'Display the cart total.',
         difficulty: 'easy',
         tagIds: [1],
         cloudFunctionName: 'cart-total',
      }),
   );
   const output = await run(dir, ['upload', '--dry-run'], () =>
      assert.fail('Dry run attempted a network request'),
   );
   assert.equal(output.payload.cloudFunctionName, 'cart-total');
});
