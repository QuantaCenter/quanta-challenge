import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { parseBody, requireScope } from '../middlewares';
import {
   CreateFunctionSchema,
   PublishVersionSchema,
   TestFunctionSchema,
   UpdateFunctionSchema,
} from '../schemas';
import { compileFunction } from '../services/compiler';
import { executor } from '../services/executor';
import { CloudFunctionKv } from '../services/kv';
import {
   invalidateFunction,
   loadFunction,
} from '../services/registry';
import { fail } from '../utils/errors';
import prisma from '../utils/prisma';

const functionsRoute = new Hono();

const sha256Hex = (value: string): string =>
   createHash('sha256').update(value).digest('hex');

const actorOf = (keyId: string, userId: string | null): string =>
   userId ?? `key:${keyId}`;

functionsRoute.post('/', requireScope('manage'), async (c) => {
   const caller = c.get('caller');
   const body = parseBody(c, CreateFunctionSchema);

   const existing = await prisma.cloudFunction.findUnique({
      where: { name: body.name },
   });
   if (existing) fail('INVALID_INPUT', `函数「${body.name}」已存在`);

   const created = await prisma.cloudFunction.create({
      data: {
         name: body.name,
         description: body.description,
         kvUserIsolated: body.kvUserIsolated,
         timeoutMs: body.timeoutMs ?? 5000,
         createdBy: actorOf(caller.keyId, caller.userId),
      },
   });

   await invalidateFunction(created.name);
   return c.json({ ok: true, data: created }, 201);
});

functionsRoute.get('/', requireScope('read'), async (c) => {
   const keyword = c.req.query('keyword');
   const rows = await prisma.cloudFunction.findMany({
      where: keyword ? { name: { contains: keyword } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
         activeVersion: { select: { id: true, version: true, createdAt: true } },
         _count: { select: { versions: true } },
      },
   });
   return c.json({ ok: true, data: rows });
});

functionsRoute.get('/:name', requireScope('read'), async (c) => {
   const name = c.req.param('name');
   const row = await prisma.cloudFunction.findUnique({
      where: { name },
      include: {
         activeVersion: {
            select: { id: true, version: true, sourceHash: true, createdAt: true },
         },
         _count: { select: { versions: true } },
      },
   });
   if (!row) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);
   return c.json({ ok: true, data: row });
});

functionsRoute.patch('/:name', requireScope('manage'), async (c) => {
   const name = c.req.param('name');
   const body = parseBody(c, UpdateFunctionSchema);

   const existing = await prisma.cloudFunction.findUnique({ where: { name } });
   if (!existing) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

   const updated = await prisma.cloudFunction.update({
      where: { name },
      data: body,
   });

   await invalidateFunction(name);
   return c.json({ ok: true, data: updated });
});

functionsRoute.delete('/:name', requireScope('manage'), async (c) => {
   const name = c.req.param('name');
   const hard = c.req.query('hard') === 'true';

   const existing = await prisma.cloudFunction.findUnique({ where: { name } });
   if (!existing) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

   if (hard) {
      await prisma.cloudFunction.delete({ where: { name } });
   } else {
      // 默认软删：停用但保留历史与版本，可随时重新启用。
      await prisma.cloudFunction.update({
         where: { name },
         data: { enabled: false },
      });
   }

   await invalidateFunction(name);
   return c.json({ ok: true, data: { name, hard } });
});

functionsRoute.post('/:name/versions', requireScope('manage'), async (c) => {
   const name = c.req.param('name');
   const caller = c.get('caller');
   const body = parseBody(c, PublishVersionSchema);

   const fn = await prisma.cloudFunction.findUnique({ where: { name } });
   if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

   const compiled = await compileFunction(body.source, name);
   const sourceHash = sha256Hex(body.source);

   const latest = await prisma.cloudFunctionVersion.findFirst({
      where: { functionId: fn.id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, sourceHash: true },
   });

   let versionId: string;
   let version: number;

   if (latest && latest.sourceHash === sourceHash) {
      // 源码没变：复用现有版本，不产生噪音版本。
      versionId = latest.id;
      version = latest.version;
   } else {
      version = (latest?.version ?? 0) + 1;
      const created = await prisma.cloudFunctionVersion.create({
         data: {
            functionId: fn.id,
            version,
            source: body.source,
            compiledCode: compiled.code,
            sourceHash,
            createdBy: actorOf(caller.keyId, caller.userId),
         },
      });
      versionId = created.id;
   }

   if (body.activate) {
      await prisma.cloudFunction.update({
         where: { id: fn.id },
         data: { activeVersionId: versionId },
      });
   }

   await invalidateFunction(name);

   return c.json(
      {
         ok: true,
         data: {
            name,
            version,
            versionId,
            activated: body.activate,
            reused: latest?.sourceHash === sourceHash,
            compiledBytes: compiled.bytes,
         },
      },
      201,
   );
});

functionsRoute.get('/:name/versions', requireScope('read'), async (c) => {
   const name = c.req.param('name');
   const fn = await prisma.cloudFunction.findUnique({ where: { name } });
   if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

   const versions = await prisma.cloudFunctionVersion.findMany({
      where: { functionId: fn.id },
      orderBy: { version: 'desc' },
      select: {
         id: true,
         version: true,
         sourceHash: true,
         createdBy: true,
         createdAt: true,
      },
   });

   return c.json({ ok: true, data: versions });
});

functionsRoute.get(
   '/:name/versions/:version',
   requireScope('read'),
   async (c) => {
      const name = c.req.param('name');
      const version = Number(c.req.param('version'));
      const fn = await prisma.cloudFunction.findUnique({ where: { name } });
      if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

      const row = await prisma.cloudFunctionVersion.findUnique({
         where: { functionId_version: { functionId: fn.id, version } },
         select: {
            id: true,
            version: true,
            source: true,
            sourceHash: true,
            createdBy: true,
            createdAt: true,
         },
      });
      if (!row) fail('FUNCTION_NOT_FOUND', `版本 ${version} 不存在`);

      return c.json({ ok: true, data: row });
   },
);

functionsRoute.post(
   '/:name/versions/:version/activate',
   requireScope('manage'),
   async (c) => {
      const name = c.req.param('name');
      const version = Number(c.req.param('version'));
      const fn = await prisma.cloudFunction.findUnique({ where: { name } });
      if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

      const row = await prisma.cloudFunctionVersion.findUnique({
         where: { functionId_version: { functionId: fn.id, version } },
         select: { id: true, version: true },
      });
      if (!row) fail('FUNCTION_NOT_FOUND', `版本 ${version} 不存在`);

      await prisma.cloudFunction.update({
         where: { id: fn.id },
         data: { activeVersionId: row.id },
      });
      await invalidateFunction(name);

      return c.json({ ok: true, data: { name, activeVersion: row.version } });
   },
);

functionsRoute.post('/:name/test', requireScope('manage'), async (c) => {
   const name = c.req.param('name');
   const caller = c.get('caller');
   const body = parseBody(c, TestFunctionSchema);

   const fn = await loadFunction(name);
   if (!fn) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);

   const compiled = await compileFunction(body.source, name);

   // 测试用的 KV 落在独立命名空间（functionId 加 :test 后缀），不污染真实数据。
   const kv = new CloudFunctionKv({
      functionId: `${fn.id}:test`,
      userIsolated: fn.kvUserIsolated,
      userId: caller.userId,
      keyId: caller.keyId,
   });

   const startedAt = Date.now();
   const data = await executor.execute({
      functionId: `${fn.id}:test`,
      name,
      version: -1,
      code: compiled.code,
      input: body.input ?? null,
      user: null,
      timeoutMs: fn.timeoutMs,
      kv,
      traceId: c.get('traceId'),
   });

   return c.json({
      ok: true,
      data: data ?? null,
      meta: { name, test: true, durationMs: Date.now() - startedAt },
   });
});

export default functionsRoute;
