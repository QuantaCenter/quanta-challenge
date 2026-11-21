import { Buffer } from 'node:buffer';
import { Hono } from 'hono';
import { assertFunctionAllowed, parseBody, requireScope } from '../middlewares';
import { InvokeSchema, JudgeInvokeSchema } from '../schemas';
import { executor } from '../services/executor';
import { recordInvocation, statusFromErrorCode } from '../services/invocations';
import { CloudFunctionKv } from '../services/kv';
import { loadFunction } from '../services/registry';
import { fail, isCloudFunctionError } from '../utils/errors';
import prisma from '../utils/prisma';
import type { CloudFunctionUser } from '../runtime/protocol';
import type { Caller } from '../types';

const invokeRoute = new Hono();
const JUDGE_KV_TTL_SECONDS = 5 * 60;
const JUDGE_TIMEOUT_MS = 5_000;
const JUDGE_USER: CloudFunctionUser = {
   id: 'qpc-local-user',
   name: 'qpc-local-user',
   role: 'USER',
};

const resolveUser = async (
   userId: string | null,
): Promise<CloudFunctionUser | null> => {
   if (!userId) return null;
   const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
   });
   if (!row) return null;
   return { id: row.id, name: row.name, role: row.role };
};

const invokeActiveFunction = async ({
   name,
   caller,
   traceId,
   input,
   timeout,
   judgeRun,
}: {
   name: string;
   caller: Caller;
   traceId: string;
   input: unknown;
   timeout?: number;
   judgeRun?: { judgeRecordId: number; runId: string };
}) => {
   const fn = await loadFunction(name);
   if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);
   if (!fn.enabled) fail('FUNCTION_DISABLED', `云函数「${name}」已停用`);
   if (!fn.activeVersion) {
      fail('FUNCTION_NOT_PUBLISHED', `云函数「${name}」尚未发布任何版本`);
   }
   const activeVersion = fn.activeVersion;

   const userId = judgeRun ? null : caller.userId;
   const user = judgeRun ? JUDGE_USER : await resolveUser(userId);

   // 请求体只能把超时**调小**，不能超过函数配置。
   const timeoutMs = Math.min(timeout ?? fn.timeoutMs, fn.timeoutMs);

   const kv = new CloudFunctionKv({
      functionId: judgeRun
         ? `${fn.id}:judge:${judgeRun.judgeRecordId}:${judgeRun.runId}`
         : fn.id,
      userIsolated: !judgeRun && fn.kvUserIsolated,
      userId,
      keyId: caller.keyId,
      maxTtlSeconds: judgeRun ? JUDGE_KV_TTL_SECONDS : undefined,
   });

   const inputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
   const startedAt = Date.now();

   let data: unknown;
   try {
      data = await executor.execute({
         functionId: fn.id,
         name: fn.name,
         version: activeVersion.version,
         code: activeVersion.compiledCode,
         input,
         user,
         timeoutMs,
         kv,
      });
   } catch (error) {
      const code = isCloudFunctionError(error) ? error.code : 'RUNTIME_ERROR';
      recordInvocation({
         functionId: fn.id,
         versionId: activeVersion.id,
         callerType: caller.type,
         callerKeyId: caller.keyId,
         userId,
         status: statusFromErrorCode(code),
         errorCode: code,
         durationMs: Date.now() - startedAt,
         inputBytes,
         outputBytes: 0,
         traceId,
      });
      throw error;
   }

   const serialized = JSON.stringify(data ?? null) ?? 'null';
   const outputBytes = Buffer.byteLength(serialized, 'utf8');
   const durationMs = Date.now() - startedAt;

   if (outputBytes > fn.maxResponseBytes) {
      recordInvocation({
         functionId: fn.id,
         versionId: activeVersion.id,
         callerType: caller.type,
         callerKeyId: caller.keyId,
         userId,
         status: 'error',
         errorCode: 'RUNTIME_ERROR',
         durationMs,
         inputBytes,
         outputBytes,
         traceId,
      });
      fail('RUNTIME_ERROR', `返回体超过上限 ${fn.maxResponseBytes} 字节`);
   }

   recordInvocation({
      functionId: fn.id,
      versionId: activeVersion.id,
      callerType: caller.type,
      callerKeyId: caller.keyId,
      userId,
      status: 'success',
      errorCode: null,
      durationMs,
      inputBytes,
      outputBytes,
      traceId,
   });

   return {
      ok: true as const,
      data: data ?? null,
      meta: {
         function: fn.name,
         version: activeVersion.version,
         durationMs,
         traceId,
      },
   };
};

invokeRoute.post('/:name', requireScope('invoke'), async (c) => {
   const name = c.req.param('name');
   const caller = c.get('caller');
   assertFunctionAllowed(caller, name);

   const body = parseBody(c, InvokeSchema);
   return c.json(
      await invokeActiveFunction({
         name,
         caller,
         traceId: c.get('traceId'),
         input: body.input ?? null,
         timeout: body.options?.timeoutMs,
      }),
   );
});

invokeRoute.post('/:name/judge', requireScope('invoke'), async (c) => {
   const name = c.req.param('name');
   const caller = c.get('caller');
   if (caller.type !== 'internal' || caller.keyId !== 'judge') {
      fail('FORBIDDEN', '只有判题调度器可以调用判题云函数入口');
   }

   const { input, judgeRecordId, runId } = parseBody(c, JudgeInvokeSchema);
   // 判题专用入口由任务记录和题目绑定授权。普通调用入口仍按白名单处理。
   const record = await prisma.judgeRecords.findUnique({
      where: {
         id: judgeRecordId,
         result: 'pending',
         problem: { problemType: 'frontend', cloudFunctionName: name },
      },
      select: { id: true },
   });
   if (!record) fail('FORBIDDEN', '该判题任务无权调用此云函数');

   return c.json(
      await invokeActiveFunction({
         name,
         caller,
         traceId: c.get('traceId'),
         input: input ?? null,
         timeout: JUDGE_TIMEOUT_MS,
         judgeRun: { judgeRecordId, runId },
      }),
   );
});

export default invokeRoute;
