import z from 'zod';

export const TaskSchema = z
   .object({
      judgeRecordId: z.number('Judge record ID is required'),
      judgeScript: z.string('Judge script is required'),
      url: z.url('URL is required'),
      mode: z.enum(
         ['audit', 'judge'],
         'Mode must be either "audit" or "judge"'
      ),
      info: z.record(z.string(), z.string()).optional(),
      designStructure: z.enum(['flat', 'hierarchical']).optional(),
      designExpectedScore: z.number().optional(),
   })
   .refine((data) => !(data.mode === 'judge' && !data.info), {
      error: 'Info is required when mode is "judge"',
   });
