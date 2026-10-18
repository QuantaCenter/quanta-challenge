import z from 'zod';

export const TaskSchema = z
   .object({
      judgeRecordId: z.number('Judge record ID is required'),
      judgeScript: z.string('Judge script is required'),
      /** 后端服务的基准地址（如 http://<alias>:3000）；刻意与前端判题机共用字段名 url，使调度器收发代码可完全复用。 */
      url: z.url('Service base URL is required'),
      mode: z.enum(
         ['audit', 'judge'],
         'Mode must be either "audit" or "judge"'
      ),
      info: z.record(z.string(), z.string()).optional(),
   })
   .refine((data) => !(data.mode === 'judge' && !data.info), {
      error: 'Info is required when mode is "judge"',
   });

export type Task = z.infer<typeof TaskSchema>;
