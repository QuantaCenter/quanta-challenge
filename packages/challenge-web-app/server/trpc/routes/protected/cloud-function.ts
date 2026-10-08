import { z } from 'zod';
import { protectedProcedure } from '../../protected-trpc';
import { router } from '../../trpc';
import {
   callCloudFunctionService,
   rethrowAsTRPCError,
} from '~~/server/utils/cloud-function-client';

const InvokeSchema = z.object({
   name: z.string().min(1),
   input: z.unknown().optional(),
});

export interface CloudFunctionSummary {
   id: string;
   name: string;
   description: string;
   enabled: boolean;
   kvUserIsolated: boolean;
   activeVersion: { version: number } | null;
}

/** 平台页面调用入口（给平台自己的前端代码用）。
 *
 * 注意：这**不是**「用户在做题时的调用入口」。用户写的解题代码请走
 * `POST /api/cloud-function/:name`（见 server/api/cloud-function/[name].post.ts），
 * 它同样把登录用户身份带进云函数服务。
 * userId 由服务端会话解析，随签名一起传给云函数服务。 */
const invokeProcedure = protectedProcedure
   .input(InvokeSchema)
   .mutation(async ({ ctx, input }) => {
      try {
         return await callCloudFunctionService<unknown>({
            method: 'POST',
            path: `/v1/invoke/${encodeURIComponent(input.name)}`,
            body: { input: input.input ?? null },
            userId: ctx.user.userId,
            traceId: ctx.traceId,
         });
      } catch (error) {
         return rethrowAsTRPCError(error);
      }
   });

/** 成员可见的云函数清单（只暴露名称/描述等非敏感信息）。 */
const listProcedure = protectedProcedure.query(async () => {
   try {
      return await callCloudFunctionService<CloudFunctionSummary[]>({
         method: 'GET',
         path: '/v1/functions',
      });
   } catch (error) {
      return rethrowAsTRPCError(error);
   }
});

export const cloudFunctionRouter = router({
   invoke: invokeProcedure,
   list: listProcedure,
});
