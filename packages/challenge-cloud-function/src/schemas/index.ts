import z from 'zod';

export const FUNCTION_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export const CreateFunctionSchema = z.object({
   name: z
      .string()
      .regex(
         FUNCTION_NAME_PATTERN,
         '函数名只能是小写字母、数字与连字符，且以字母开头，最长 63 字符',
      ),
   description: z.string().max(2000).optional().default(''),
   kvUserIsolated: z.boolean().optional().default(true),
   timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

export const UpdateFunctionSchema = z
   .object({
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
   })
   .refine((value) => Object.keys(value).length > 0, {
      message: '至少提供一个要更新的字段',
   });

export const PublishVersionSchema = z.object({
   source: z.string().min(1).max(200_000),
   activate: z.boolean().optional().default(true),
});

export const TestFunctionSchema = z.object({
   source: z.string().min(1).max(200_000),
   input: z.unknown().optional(),
});

export const InvokeSchema = z.object({
   input: z.unknown().optional(),
   options: z
      .object({ timeoutMs: z.number().int().min(1).max(30_000) })
      .optional(),
});

export const CreateKeySchema = z.object({
   name: z.string().min(1).max(100),
   scopes: z
      .array(z.enum(['invoke', 'read', 'manage']))
      .min(1)
      .default(['invoke']),
   allowedFunctions: z.array(z.string()).optional().default([]),
   expiresAt: z.union([z.string(), z.number()]).optional(),
   cloudFunctionId: z.string().optional(),
});

export const UpdateKeySchema = z
   .object({
      name: z.string().min(1).max(100).optional(),
      enabled: z.boolean().optional(),
      scopes: z.array(z.enum(['invoke', 'read', 'manage'])).optional(),
      allowedFunctions: z.array(z.string()).optional(),
      expiresAt: z.union([z.string(), z.number()]).nullable().optional(),
   })
   .refine((value) => Object.keys(value).length > 0, {
      message: '至少提供一个要更新的字段',
   });
