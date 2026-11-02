import z from 'zod';

export const feedbackTypeSchema = z.enum([
   'bug',
   'problem_judge',
   'suggestion',
   'other',
]);

export const feedbackStatusSchema = z.enum([
   'pending',
   'working',
   'resolved',
   'closed',
]);

export const feedbackDiagnosticSchema = z.object({
   browser: z.string().max(300).optional(),
   platform: z.string().max(100).optional(),
   viewport: z.string().max(40).optional(),
});

export const feedbackListSchema = z.object({
   status: feedbackStatusSchema.optional(),
   type: feedbackTypeSchema.optional(),
   keyword: z.string().trim().max(80).optional(),
   cursor: z.number().int().positive().nullish(),
   limit: z.number().int().min(1).max(50).default(20),
});

export const feedbackIdSchema = z.object({
   id: z.number().int().positive(),
});
