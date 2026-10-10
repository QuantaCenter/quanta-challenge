import z from 'zod';

export const TaskSchema = z
   .object({
      judgeRecordId: z.number('Judge record ID is required'),
      judgeScript: z.string('Judge script is required'),
      /**
       * 后端服务的基准地址（如 http://<alias>:3000）。
       *
       * 刻意与前端判题机共用字段名 `url`：两个判题机的任务信封完全一致，
       * 差别只在沙箱里暴露的能力（前端是 page，后端是 http + $）。
       * 这样调度器发任务、收 JRTP 结果的代码可以完全复用。
       */
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
