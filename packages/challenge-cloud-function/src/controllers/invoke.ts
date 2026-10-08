import { Buffer } from 'node:buffer';
import { Hono } from 'hono';
import { assertFunctionAllowed, parseBody, requireScope } from '../middlewares';
import { InvokeSchema } from '../schemas';
import { executor } from '../services/executor';
import { recordInvocation, statusFromErrorCode } from '../services/invocations';
import { CloudFunctionKv } from '../services/kv';
import { loadFunction } from '../services/registry';
import { fail, isCloudFunctionError } from '../utils/errors';
import prisma from '../utils/prisma';
import type { CloudFunctionUser } from '../runtime/protocol';

const invokeRoute = new Hono();

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

invokeRoute.post('/:name', requireScope('invoke'), async (c) => {
   const name = c.req.param('name');
   const caller = c.get('caller');
   const traceId = c.get('traceId');

   assertFunctionAllowed(caller, name);
   const body = parseBody(c, InvokeSchema);

   const fn = await loadFunction(name);
   if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);
   if (!fn.enabled) fail('FUNCTION_DISABLED', `云函数「${name}」已停用`);
   if (!fn.activeVersion) {
      fail('FUNCTION_NOT_PUBLISHED', `云函数「${name}」尚未发布任何版本`);
   }
   const activeVersion = fn.activeVersion;

   const user = await resolveUser(caller.userId);

   // 请求体只能把超时**调小**，不能超过函数配置。
   const timeoutMs = Math.min(
      body.options?.timeoutMs ?? fn.timeoutMs,
      fn.timeoutMs,
   );

   const kv = new CloudFunctionKv({
      functionId: fn.id,
      userIsolated: fn.kvUserIsolated,
      userId: caller.userId,
      keyId: caller.keyId,
   });

   const inputBytes = Buffer.byteLength(
      JSON.stringify(body.input ?? null),
      'utf8',
   );
   const startedAt = Date.now();

   let data: unknown;
   try {
      data = await executor.execute({
         functionId: fn.id,
         name: fn.name,
         version: activeVersion.version,
         code: activeVersion.compiledCode,
         input: body.input ?? null,
         user,
         timeoutMs,
         kv,
         traceId,
      });
   } catch (error) {
      const code = isCloudFunctionError(error) ? error.code : 'RUNTIME_ERROR';
      recordInvocation({
         functionId: fn.id,
         versionId: activeVersion.id,
         callerType: caller.type,
         callerKeyId: caller.keyId,
         userId: caller.userId,
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
         userId: caller.userId,
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
      userId: caller.userId,
      status: 'success',
      errorCode: null,
      durationMs,
      inputBytes,
      outputBytes,
      traceId,
   });

   return c.json({
      ok: true,
      data: data ?? null,
      meta: {
         function: fn.name,
         version: activeVersion.version,
         durationMs,
         traceId,
      },
   });
});

export default invokeRoute;
