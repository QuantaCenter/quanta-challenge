import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli';
import { EXIT } from '../src/core/exit-codes';
import { createProcessRuntime } from '../src/core/runtime';
import type { LocalJudgeOutcome } from '../src/services/local-judge/runner';

const source = `
type CartInput = { amounts: number[] };

export default async function (ctx: CloudFunctionContext<CartInput>) {
   const { amounts } = ctx.requireInput<CartInput>(['amounts']);
   const total = await ctx.kv.incr('total', amounts.reduce((sum, amount) => sum + amount, 0));
   return { total, role: ctx.requireUser().role };
}
`;

const pageHtml = (moreAmounts: number[]) => `<!doctype html>
<meta charset="utf-8">
<output id="first"></output>
<button id="more">Add to cart</button>
<output id="last"></output>
<script>
   async function update(path, amounts, output) {
      try {
         const response = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: { amounts } }),
         });
         const { data } = await response.json();
         document.querySelector(output).textContent = data.total + ':' + data.role;
      } catch (error) {
         document.querySelector(output).textContent = String(error);
      }
   }

   const firstCall = update(
      'https://qpc-cloud-test.invalid/api/cloud-function/invoke/cart-total', [2, 4], '#first',
   );
   document.querySelector('#more').onclick = async () => {
      await firstCall;
      await update('/api/cloud-function/cart-total', ${JSON.stringify(moreAmounts)}, '#last');
   };
</script>
`;

const judge = `
export default defineTestHandler(async ({ page, $ }) => {
   $.defineCheckPoint('Initial cart', 25, async () => {
      await page.waitForSelector('#first:not(:empty)', { timeout: 3_000 });
      const actual = await page.textContent('#first');
      $.expect(actual === '6:USER', 'expected 6:USER, received ' + actual);
      return 25;
   });
   $.defineCheckPoint('Updated cart', 25, async () => {
      await page.click('#more', { timeout: 3_000 });
      await page.waitForSelector('#last:not(:empty)', { timeout: 3_000 });
      const actual = await page.textContent('#last');
      $.expect(actual === '13:USER', 'expected 13:USER, received ' + actual);
      return 25;
   });
});
`;

const runCheck = async (workspace: string, ...args: string[]) => {
   const stdout: string[] = [];
   const stderr: string[] = [];
   const exitCode = await runCli(
      ['node', 'qpc', 'check', 'problem', '--strict', '--json', ...args],
      createProcessRuntime({
         cwd: workspace,
         env: { QUANTA_CONFIG_DIR: join(workspace, 'credentials') },
         fetch: async () => assert.fail('qpc check called the platform API'),
         stdout: (chunk) => stdout.push(chunk),
         stderr: (chunk) => stderr.push(chunk),
      }),
   );
   return { exitCode, stdout, stderr: stderr.join('') };
};

test('qpc check executes the configured cloud function from the normal browser request path', async (t) => {
   const workspace = await mkdtemp(join(tmpdir(), 'qpc-check-cloud-'));
   t.after(() => rm(workspace, { recursive: true, force: true }));
   const problem = join(workspace, 'problem');
   await Promise.all(
      ['answer', 'template', 'functions'].map((dir) =>
         mkdir(join(problem, dir), { recursive: true }),
      ),
   );
   await Promise.all([
      writeFile(
         join(problem, 'problem.config.json'),
         JSON.stringify({
            title: 'Cart',
            detail: 'Display the cart total.',
            difficulty: 'easy',
            tagIds: [1],
            cloudFunctionName: 'cart-total',
            cloudFunctionSource: './functions/cart-total.ts',
         }),
      ),
      writeFile(join(problem, 'answer/index.html'), pageHtml([3, 4])),
      writeFile(join(problem, 'template/index.html'), pageHtml([3])),
      writeFile(join(problem, 'judge.js'), judge),
   ]);

   const missing = await runCheck(workspace, '--no-run');
   assert.equal(missing.exitCode, EXIT.PRECHECK_FAILED, missing.stderr);
   assert.match(missing.stdout.join(''), /CFG003/);

   const file = join(problem, 'functions/cart-total.ts');
   await writeFile(file, 'export default function ( {');
   const staticOnly = await runCheck(workspace, '--no-run');
   assert.equal(staticOnly.exitCode, EXIT.OK, staticOnly.stderr);
   const compileFailure = await runCheck(workspace);
   assert.equal(
      compileFailure.exitCode,
      EXIT.PRECHECK_FAILED,
      compileFailure.stderr,
   );
   assert.match(compileFailure.stdout.join(''), /COMPILE_ERROR/);

   await writeFile(file, source);
   const checked = await runCheck(workspace);
   const report = JSON.parse(checked.stdout[0] ?? '{}') as {
      localJudge?: LocalJudgeOutcome;
   };
   if (report.localJudge?.skipped) {
      t.skip(report.localJudge.skipped.reason);
      return;
   }
   assert.equal(
      checked.exitCode,
      EXIT.OK,
      checked.stderr + checked.stdout.join(''),
   );
   assert.deepEqual(
      report.localJudge?.runs.map(({ label, score }) => ({ label, score })),
      [
         { label: 'answer', score: 50 },
         { label: 'template', score: 25 },
      ],
   );
});
