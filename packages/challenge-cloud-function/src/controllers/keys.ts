import { Hono } from 'hono';
import { parseBody, requireScope } from '../middlewares';
import { CreateKeySchema, UpdateKeySchema } from '../schemas';
import { deriveSecret } from '../services/keys';
import { config } from '../config';
import { fail } from '../utils/errors';
import { createKeyId } from '../utils/ids';
import prisma from '../utils/prisma';

const keysRoute = new Hono();

const currentMasterVersion = (): number => {
   const versions = Object.keys(config.masterSecrets)
      .map(Number)
      .filter((value) => Number.isFinite(value));
   return versions.length > 0 ? Math.max(...versions) : 1;
};

const parseExpiry = (value: string | number | null | undefined): Date | null => {
   if (value === undefined || value === null) return null;
   const date = new Date(value);
   if (Number.isNaN(date.getTime())) {
      fail('INVALID_INPUT', 'expiresAt 不是合法时间');
   }
   return date;
};

keysRoute.post('/', requireScope('manage'), async (c) => {
   const caller = c.get('caller');
   const body = parseBody(c, CreateKeySchema);

   const keyId = createKeyId();
   const masterVersion = currentMasterVersion();
   const secret = deriveSecret(keyId, masterVersion);
   if (!secret) {
      fail('INTERNAL_ERROR', '无法派生密钥：主密钥未配置');
   }

   const expiresAt = parseExpiry(body.expiresAt);

   const row = await prisma.cloudFunctionApiKey.create({
      data: {
         keyId,
         name: body.name,
         scopes: body.scopes,
         allowedFunctions: body.allowedFunctions,
         masterVersion,
         expiresAt,
         createdBy: caller.userId ?? `key:${caller.keyId}`,
         cloudFunctionId: body.cloudFunctionId ?? null,
      },
      select: {
         keyId: true,
         name: true,
         scopes: true,
         allowedFunctions: true,
         expiresAt: true,
         createdAt: true,
      },
   });

   // secret 只在这一次响应里出现；数据库不保存，之后无法再次获取。
   return c.json({ ok: true, data: { ...row, secret } }, 201);
});

keysRoute.get('/', requireScope('read'), async (c) => {
   const rows = await prisma.cloudFunctionApiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
         keyId: true,
         name: true,
         scopes: true,
         allowedFunctions: true,
         enabled: true,
         expiresAt: true,
         lastUsedAt: true,
         createdBy: true,
         createdAt: true,
         cloudFunctionId: true,
      },
   });
   return c.json({ ok: true, data: rows });
});

keysRoute.patch('/:keyId', requireScope('manage'), async (c) => {
   const keyId = c.req.param('keyId');
   const body = parseBody(c, UpdateKeySchema);

   const existing = await prisma.cloudFunctionApiKey.findUnique({
      where: { keyId },
   });
   if (!existing) fail('FUNCTION_NOT_FOUND', `API Key「${keyId}」不存在`);

   const updated = await prisma.cloudFunctionApiKey.update({
      where: { keyId },
      data: {
         name: body.name,
         enabled: body.enabled,
         scopes: body.scopes,
         allowedFunctions: body.allowedFunctions,
         expiresAt:
            body.expiresAt === undefined ? undefined : parseExpiry(body.expiresAt),
      },
      select: {
         keyId: true,
         name: true,
         scopes: true,
         allowedFunctions: true,
         enabled: true,
         expiresAt: true,
      },
   });

   return c.json({ ok: true, data: updated });
});

keysRoute.delete('/:keyId', requireScope('manage'), async (c) => {
   const keyId = c.req.param('keyId');
   const existing = await prisma.cloudFunctionApiKey.findUnique({
      where: { keyId },
   });
   if (!existing) fail('FUNCTION_NOT_FOUND', `API Key「${keyId}」不存在`);

   await prisma.cloudFunctionApiKey.delete({ where: { keyId } });
   return c.json({ ok: true, data: { keyId, deleted: true } });
});

export default keysRoute;
