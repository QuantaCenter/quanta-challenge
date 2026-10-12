import z from 'zod';

/**
 * 结果 schema 与前端判题机**逐字段一致**——这是刻意的。
 *
 * 调度器的 `processResult` / 落库 / Web 回调只认这一种形状，
 * 后端题型因此不需要在调度器里复制一份"结果处理"。任何新增结果字段
 * （例如给后端加的响应快照）都要同时落在两边，否则会在 unpack 校验处才暴露。
 */
export const JudgeSuccessResultSchema = z.object({
   type: z.literal('done'),
   message: z.string(),
   judgeTime: z.number(),
   totalScore: z.number(),
   maxScore: z.number(),
   status: z.enum(['completed', 'fail']),
   judgeRecordId: z.number(),
   results: z.array(
      z.object({
         score: z.number(),
         totalScore: z.number(),
         details: z.string(),
         status: z.enum(['pass', 'fail']),
         cacheFiles: z.record(z.string(), z.instanceof(Buffer)),
      })
   ),
});

export const JudgeErrorResultSchema = z.object({
   type: z.literal('error'),
   message: z.string(),
   judgeRecordId: z.number().optional(),
   judgeTime: z.number(),
});

export const JudgeResultSchema = z.discriminatedUnion('type', [
   JudgeSuccessResultSchema,
   JudgeErrorResultSchema,
]);
