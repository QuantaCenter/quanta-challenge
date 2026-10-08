import { z } from 'zod';
import prisma from '~~/lib/prisma';
import { protectedAdminProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   callCloudFunctionService,
   rethrowAsTRPCError,
   type CloudFunctionApiKeyRecord,
   type CloudFunctionRecord,
   type CloudFunctionVersionRecord,
   type CreatedCloudFunctionApiKey,
   type PublishVersionResult,
} from '~~/server/utils/cloud-function-client';

const FunctionNameSchema = z
   .string()
   .regex(
      /^[a-z][a-z0-9-]{0,62}$/,
      '函数名只能是小写字母、数字与连字符，且以字母开头，最长 63 字符',
   );

const ScopeSchema = z.enum(['invoke', 'read', 'manage']);

/**
 * 云函数服务只存 `createdBy`（用户 ID 或 `key:<keyId>`），这里补齐发布者的
 * 昵称与头像，供前端直接展示「头像 + 昵称」；解析不到（API Key 发布）时为 null。
 */
const enrichVersionCreators = async (
   versions: CloudFunctionVersionRecord[],
) => {
   const userIds = [
      ...new Set(
         versions
            .map((version) => version.createdBy)
            .filter((id) => !id.startsWith('key:')),
      ),
   ];
   const users = userIds.length
      ? await prisma.user.findMany({
           where: { id: { in: userIds } },
           select: {
              id: true,
              name: true,
              displayName: true,
              avatar: { select: { name: true } },
           },
        })
      : [];
   const userMap = new Map(users.map((user) => [user.id, user]));

   return versions.map((version) => {
      const user = userMap.get(version.createdBy);
      return {
         ...version,
         createdByUser: user
            ? {
                 // displayName 允许为空（历史用户），回退到用户名
                 displayName: user.displayName || user.name,
                 avatarUrl: user.avatar?.name
                    ? `/api/static/${user.avatar.name}`
                    : null,
              }
            : null,
      };
   });
};

const createProcedure = protectedAdminProcedure
   .input(
      z.object({
         name: FunctionNameSchema,
         description: z.string().max(2000).optional(),
         kvUserIsolated: z.boolean().optional(),
         timeoutMs: z.number().int().min(100).max(30_000).optional(),
      }),
   )
   .mutation(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<CloudFunctionRecord>({
            method: 'POST',
            path: '/v1/functions',
            body: input,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const listProcedure = protectedAdminProcedure
   .input(z.object({ keyword: z.string().optional() }).optional())
   .query(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<CloudFunctionRecord[]>({
            method: 'GET',
            path: '/v1/functions',
            query: input?.keyword ? { keyword: input.keyword } : undefined,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const getProcedure = protectedAdminProcedure
   .input(z.object({ name: FunctionNameSchema }))
   .query(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<CloudFunctionRecord>({
            method: 'GET',
            path: `/v1/functions/${input.name}`,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const updateProcedure = protectedAdminProcedure
   .input(
      z.object({
         name: FunctionNameSchema,
         description: z.string().max(2000).optional(),
         enabled: z.boolean().optional(),
         kvUserIsolated: z.boolean().optional(),
         timeoutMs: z.number().int().min(100).max(30_000).optional(),
         maxResponseBytes: z
            .number()
            .int()
            .min(1024)
            .max(4 * 1024 * 1024)
            .optional(),
      }),
   )
   .mutation(async ({ ctx, input }) => {
      const { name, ...patch } = input;
      try {
         return await callCloudFunctionService<CloudFunctionRecord>({
            method: 'PATCH',
            path: `/v1/functions/${name}`,
            body: patch,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const removeProcedure = protectedAdminProcedure
   .input(z.object({ name: FunctionNameSchema, hard: z.boolean().optional() }))
   .mutation(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<{ name: string; hard: boolean }>(
            {
               method: 'DELETE',
               path: `/v1/functions/${input.name}`,
               query: input.hard ? { hard: 'true' } : undefined,
               userId: ctx.user.userId,
            },
         );
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const publishVersionProcedure = protectedAdminProcedure
   .input(
      z.object({
         name: FunctionNameSchema,
         source: z.string().min(1).max(200_000),
         activate: z.boolean().optional(),
      }),
   )
   .mutation(async ({ ctx, input }) => {
      const { name, ...body } = input;
      try {
         return await callCloudFunctionService<PublishVersionResult>({
            method: 'POST',
            path: `/v1/functions/${name}/versions`,
            body,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const listVersionsProcedure = protectedAdminProcedure
   .input(z.object({ name: FunctionNameSchema }))
   .query(async ({ ctx, input }) => {
      try {
         const versions = await callCloudFunctionService<
            CloudFunctionVersionRecord[]
         >({
            method: 'GET',
            path: `/v1/functions/${input.name}/versions`,
            userId: ctx.user.userId,
         });
         return await enrichVersionCreators(versions);
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const getVersionProcedure = protectedAdminProcedure
   .input(z.object({ name: FunctionNameSchema, version: z.number().int() }))
   .query(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<CloudFunctionVersionRecord>({
            method: 'GET',
            path: `/v1/functions/${input.name}/versions/${input.version}`,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const activateVersionProcedure = protectedAdminProcedure
   .input(z.object({ name: FunctionNameSchema, version: z.number().int() }))
   .mutation(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<{
            name: string;
            activeVersion: number;
         }>({
            method: 'POST',
            path: `/v1/functions/${input.name}/versions/${input.version}/activate`,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const testProcedure = protectedAdminProcedure
   .input(
      z.object({
         name: FunctionNameSchema,
         source: z.string().min(1).max(200_000),
         input: z.unknown().optional(),
      }),
   )
   .mutation(async ({ ctx, input }) => {
      const { name, ...body } = input;
      try {
         return await callCloudFunctionService<unknown>({
            method: 'POST',
            path: `/v1/functions/${name}/test`,
            body,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const listKeysProcedure = protectedAdminProcedure.query(async ({ ctx }) => {
   try {
      return await callCloudFunctionService<CloudFunctionApiKeyRecord[]>({
         method: 'GET',
         path: '/v1/keys',
         userId: ctx.user.userId,
      });
   } catch (error) {
      return rethrowAsTRPCError(error);
   }
});

const createKeyProcedure = protectedAdminProcedure
   .input(
      z.object({
         name: z.string().min(1).max(100),
         scopes: z.array(ScopeSchema).min(1),
         allowedFunctions: z.array(z.string()).optional(),
         expiresAt: z.union([z.string(), z.number()]).optional(),
      }),
   )
   .mutation(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<CreatedCloudFunctionApiKey>({
            method: 'POST',
            path: '/v1/keys',
            body: input,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const updateKeyProcedure = protectedAdminProcedure
   .input(
      z.object({
         keyId: z.string().min(1),
         name: z.string().min(1).max(100).optional(),
         enabled: z.boolean().optional(),
         scopes: z.array(ScopeSchema).optional(),
         allowedFunctions: z.array(z.string()).optional(),
         expiresAt: z.union([z.string(), z.number()]).nullable().optional(),
      }),
   )
   .mutation(async ({ ctx, input }) => {
      const { keyId, ...patch } = input;
      try {
         return await callCloudFunctionService<CloudFunctionApiKeyRecord>({
            method: 'PATCH',
            path: `/v1/keys/${keyId}`,
            body: patch,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

const revokeKeyProcedure = protectedAdminProcedure
   .input(z.object({ keyId: z.string().min(1) }))
   .mutation(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<{
            keyId: string;
            deleted: boolean;
         }>({
            method: 'DELETE',
            path: `/v1/keys/${input.keyId}`,
            userId: ctx.user.userId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

export const cloudFunctionAdminRouter = router({
   list: listProcedure,
   get: getProcedure,
   create: createProcedure,
   update: updateProcedure,
   remove: removeProcedure,
   publishVersion: publishVersionProcedure,
   listVersions: listVersionsProcedure,
   getVersion: getVersionProcedure,
   activateVersion: activateVersionProcedure,
   test: testProcedure,
   listKeys: listKeysProcedure,
   createKey: createKeyProcedure,
   updateKey: updateKeyProcedure,
   revokeKey: revokeKeyProcedure,
});
