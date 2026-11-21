import z from 'zod';

export const JudgeCloudFunctionNameSchema = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);

const CloudFunctionRequestIdentity = z.object({
   judgeRecordId: z.number().int().positive(),
   requestId: z.uuid(),
});

export const CloudFunctionInvokeSchema = CloudFunctionRequestIdentity.extend({
   type: z.literal('cloud-function-invoke'),
   phase: z.literal('design').optional(),
   input: z.unknown(),
});

export const CloudFunctionResultSchema = CloudFunctionRequestIdentity.extend({
   type: z.literal('cloud-function-result'),
   status: z.number().int().min(200).max(599),
   body: z.unknown(),
});
