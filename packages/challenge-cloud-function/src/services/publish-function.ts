import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { fail } from '../utils/errors';
import prisma from '../utils/prisma';
import { compileFunction } from './compiler';
import { invalidateFunction } from './registry';

interface PublishOptions {
   name: string;
   source: string;
   activate: boolean;
   actor: string;
   create?: { description: string };
}

export const publishFunction = async ({
   name,
   source,
   activate,
   actor,
   create,
}: PublishOptions) => {
   if (!create) {
      const existing = await prisma.cloudFunction.findUnique({
         where: { name },
         select: { id: true },
      });
      if (!existing) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);
   }

   const compiled = await compileFunction(source, name);
   const sourceHash = createHash('sha256').update(source).digest('hex');

   for (let attempt = 1; ; attempt++) {
      try {
         const result = await prisma.$transaction(
            async (tx) => {
               let fn = await tx.cloudFunction.findUnique({
                  where: { name },
                  select: { id: true },
               });
               const created = !fn;
               if (!fn) {
                  if (!create) fail('FUNCTION_NOT_FOUND', `云函数「${name}」不存在`);
                  fn = await tx.cloudFunction.create({
                     data: { name, description: create.description, createdBy: actor },
                     select: { id: true },
                  });
               }

               const latest = await tx.cloudFunctionVersion.findFirst({
                  where: { functionId: fn.id },
                  orderBy: { version: 'desc' },
                  select: { id: true, version: true, sourceHash: true },
               });
               const reused = latest?.sourceHash === sourceHash;
               const version = reused
                  ? latest
                  : await tx.cloudFunctionVersion.create({
                       data: {
                          functionId: fn.id,
                          version: (latest?.version ?? 0) + 1,
                          source,
                          compiledCode: compiled.code,
                          sourceHash,
                          createdBy: actor,
                       },
                       select: { id: true, version: true },
                    });

               if (activate) {
                  await tx.cloudFunction.update({
                     where: { id: fn.id },
                     data: { activeVersionId: version.id },
                  });
               }

               return {
                  name,
                  version: version.version,
                  versionId: version.id,
                  activated: activate,
                  reused,
                  compiledBytes: compiled.bytes,
                  created,
               };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
         );

         await invalidateFunction(name);
         return result;
      } catch (error) {
         // 同名函数或版本号可能同时写入，重读最新版本后重试。
         if (
            attempt >= 3 ||
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            (error.code !== 'P2002' && error.code !== 'P2034')
         ) {
            throw error;
         }
      }
   }
};
