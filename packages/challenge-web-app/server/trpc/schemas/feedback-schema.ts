import { isValidTraceId } from '@challenge/shared/trace';
import z from 'zod';

export const FeedbackCategorySchema = z.enum(['bug', 'suggestion', 'other']);

export const SubmitFeedbackSchema = z.object({
   category: FeedbackCategorySchema,
   description: z
      .string()
      .trim()
      .min(10, '请至少输入 10 个字符')
      .max(2000, '反馈内容最多 2000 个字符')
      .refine((value) => !value.includes('\0'), '反馈内容包含无效字符'),
   contact: z.string().trim().max(254).pipe(z.email()).optional(),
   notifyOnResolve: z.boolean().default(false),
   pagePath: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)[^?#\\\u0000-\u001f\u007f]*$/u)
      .optional(),
   traceId: z.string().refine(isValidTraceId).optional(),
   submissionId: z.uuid().transform((value) => value.toLowerCase()).optional(),
});
