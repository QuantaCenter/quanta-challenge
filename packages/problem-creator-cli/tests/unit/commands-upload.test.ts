import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runPublish } from '../../src/commands/publish';
import { runStatus } from '../../src/commands/status';
import { runUpload, waitForAudit } from '../../src/commands/upload';
import { PrecheckError, UsageError } from '../../src/core/errors';
import type { AuditDetail } from '../../src/services/admin-api';
import { createFakeApi, trpcError, trpcOk } from '../helpers/fake-api';
import {
   createTestContext,
   exampleDir,
   seedCredentials,
} from '../helpers/harness';

const CONFIG_DIR = join(tmpdir(), 'qpc-test-upload');

const auditDetail = (
   overrides: Partial<AuditDetail> = {},
   result: 'pending' | 'success' | 'failed' = 'success',
   score = 20,
): AuditDetail => ({
   pid: 101,
   title: '计数器：点击与状态联动',
   totalScore: 20,
   status: result === 'success' ? 'ready' : 'invalid',
   difficulty: 'easy',
   tags: [{ name: 'Vue3', color: '#fff' }],
   TemplateJudgeRecord: [
      {
         judgeRecord: {
            id: 9,
            result,
            score,
            type: 'audit',
            info: [
               {
                  score: 5,
                  totalScore: 5,
                  details: '初始计数为 0',
                  status: 'pass',
               },
               {
                  score: 15,
                  totalScore: 15,
                  details: '点击 3 次后计数为 3',
                  status: 'pass',
               },
            ],
         },
      },
   ],
   ...overrides,
});

const setup = async (fetch: ReturnType<typeof createFakeApi>['fetch']) => {
   await seedCredentials(CONFIG_DIR);
   return createTestContext({
      cwd: exampleDir(),
      env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
      fetch,
   });
};

describe('qpc upload', () => {
   it('--dry-run 只做预检，不发任何请求', async () => {
      const api = createFakeApi({});
      const { ctx, harness } = await setup(api.fetch);

      await runUpload(ctx, { dir: '.', dryRun: true });

      expect(api.requests).toHaveLength(0);
      expect(harness.out()).toContain('未发起任何请求');
      expect(harness.out()).toContain('判题打包目录');
   });

   it('上传请求体符合 UploadSchema，且快照键带 /project 前缀', async () => {
      const api = createFakeApi({
         'POST /api/trpc/admin.problem.upload': () =>
            trpcOk({ problemId: 101, message: 'ok' }),
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail()),
      });
      const { ctx } = await setup(api.fetch);

      await runUpload(ctx, { dir: '.', interval: '0.05' });

      const body = api.requests[0]?.body as Record<string, unknown>;
      expect(body).toMatchObject({
         title: '计数器：点击与状态联动',
         tagIds: [1],
         difficulty: 'easy',
         totalScore: 20,
         coverMode: 'default',
         judgeUploadPath: 'project',
         initCommand: 'npx serve -l 3000 project',
      });
      expect(body.judgeScript).toContain('export default defineTestHandler');
      expect(Object.keys(body.answerTemplateSnapshot as object)).toEqual([
         '/project/index.html',
      ]);
      expect(Object.keys(body.referenceAnswerSnapshot as object)).toEqual([
         '/project/index.html',
      ]);
      // 上传时必须带会话 cookie
      expect(api.requests[0]?.headers.cookie).toContain(
         'quanta_access_token=access-1',
      );
   });

   it('审计通过并拿到满分 → 成功', async () => {
      const api = createFakeApi({
         'POST /api/trpc/admin.problem.upload': () =>
            trpcOk({ problemId: 101, message: 'ok' }),
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail()),
      });
      const { ctx, harness } = await setup(api.fetch);

      await runUpload(ctx, { dir: '.', interval: '0.05' });

      expect(harness.out()).toContain('题目已创建：#101');
      expect(harness.out()).toContain('审计通过：20 分满分');
      expect(harness.out()).toContain('qpc publish 101');
   });

   it('审计失败（分数不等于总分）→ PrecheckError', async () => {
      const api = createFakeApi({
         'POST /api/trpc/admin.problem.upload': () =>
            trpcOk({ problemId: 101, message: 'ok' }),
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail({ status: 'invalid' }, 'failed', 15)),
      });
      const { ctx } = await setup(api.fetch);

      const error = (await runUpload(ctx, { dir: '.', interval: '0.05' }).catch(
         (e: unknown) => e,
      )) as PrecheckError;
      expect(error).toBeInstanceOf(PrecheckError);
      expect(error.exitCode).toBe(3);
      expect(error.message).toContain('审计未通过');
   });

   it('预检不通过时在发请求之前就中止', async () => {
      const api = createFakeApi({});
      await seedCredentials(CONFIG_DIR);
      const { ctx } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
      });
      // 用不存在的目录模拟"配置都不对"的情况
      await expect(
         runUpload(ctx, { dir: 'not-exists', interval: '0.05' }),
      ).rejects.toThrow(/找不到题目配置/);
      expect(api.requests).toHaveLength(0);
   });

   it('--no-wait 上传后立即返回', async () => {
      const api = createFakeApi({
         'POST /api/trpc/admin.problem.upload': () =>
            trpcOk({ problemId: 101, message: 'ok' }),
      });
      const { ctx, harness } = await setup(api.fetch);

      await runUpload(ctx, { dir: '.', wait: false });

      expect(api.count('GET', '/api/trpc/admin.problem.getAuditDetail')).toBe(
         0,
      );
      expect(harness.out()).toContain('qpc status 101 --watch');
   });

   it('未登录时给出 qpc login 提示', async () => {
      const api = createFakeApi({});
      const { ctx } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: join(tmpdir(), 'qpc-empty-config') },
         fetch: api.fetch,
      });

      await expect(runUpload(ctx, { dir: '.' })).rejects.toThrow(/尚未登录/);
   });
});

describe('waitForAudit', () => {
   it('轮询直到审计不再是 pending', async () => {
      let calls = 0;
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () => {
            calls += 1;
            return trpcOk(
               calls < 3
                  ? auditDetail({ status: 'draft' }, 'pending', 0)
                  : auditDetail(),
            );
         },
      });
      const { ctx } = await setup(api.fetch);

      const detail = await waitForAudit(ctx, 101, '5', '0.05');

      expect(detail.status).toBe('ready');
      expect(calls).toBe(3);
   });

   it('超时后提示去看调度器日志而不是静默返回', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail({ status: 'draft' }, 'pending', 0)),
      });
      const { ctx } = await setup(api.fetch);

      const error = (await waitForAudit(ctx, 101, '0.2', '0.05').catch(
         (e: unknown) => e,
      )) as PrecheckError;
      expect(error).toBeInstanceOf(PrecheckError);
      expect(error.hint).toContain('调度器');
   });
});

describe('qpc status', () => {
   it('打印检查点明细并支持 --json', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail()),
      });
      await seedCredentials(CONFIG_DIR);
      const { ctx, harness } = await createTestContext({
         cwd: exampleDir(),
         env: { QUANTA_CONFIG_DIR: CONFIG_DIR },
         fetch: api.fetch,
         globals: { json: true },
      });

      await runStatus(ctx, { problemId: '101' });

      const payload = JSON.parse(harness.out().trim()) as {
         problemId: number;
         audit: { result: string; score: number };
      };
      expect(payload.problemId).toBe(101);
      expect(payload.audit.result).toBe('success');
      expect(payload.audit.score).toBe(20);
   });

   it('id 非法时是用法错误', async () => {
      const api = createFakeApi({});
      const { ctx } = await setup(api.fetch);
      await expect(runStatus(ctx, { problemId: 'abc' })).rejects.toBeInstanceOf(
         UsageError,
      );
   });
});

describe('qpc publish', () => {
   it('status=ready 时发布', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail()),
         'POST /api/trpc/admin.problem.setStatus': (request) => {
            expect(request.body).toEqual({ problemId: 101, publish: true });
            return trpcOk({ message: 'Problem is now published' });
         },
      });
      const { ctx, harness } = await setup(api.fetch);

      await runPublish(ctx, { problemId: '101' });

      expect(harness.out()).toContain('Problem is now published');
   });

   it('审计没通过（draft）时提前拦截', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail({ status: 'draft' }, 'pending', 0)),
      });
      const { ctx } = await setup(api.fetch);

      await expect(runPublish(ctx, { problemId: '101' })).rejects.toThrow(
         /不能发布/,
      );
      expect(api.count('POST', '/api/trpc/admin.problem.setStatus')).toBe(0);
   });

   it('--unpublish 把 published 退回 ready', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk({ ...auditDetail(), status: 'published' }),
         'POST /api/trpc/admin.problem.setStatus': (request) => {
            expect(request.body).toEqual({ problemId: 101, publish: false });
            return trpcOk({ message: 'Problem is now ready' });
         },
      });
      const { ctx } = await setup(api.fetch);

      await runPublish(ctx, { problemId: '101', unpublish: true });
      expect(api.count('POST', '/api/trpc/admin.problem.setStatus')).toBe(1);
   });

   it('服务端的 4xx 原样透出（不吞掉细节）', async () => {
      const api = createFakeApi({
         'GET /api/trpc/admin.problem.getAuditDetail': () =>
            trpcOk(auditDetail()),
         'POST /api/trpc/admin.problem.setStatus': () =>
            trpcError(
               'Cannot change publish status of a problem that is not the current version',
               {
                  status: 400,
               },
            ),
      });
      const { ctx } = await setup(api.fetch);

      await expect(runPublish(ctx, { problemId: '101' })).rejects.toThrow(
         /not the current version/,
      );
   });
});
