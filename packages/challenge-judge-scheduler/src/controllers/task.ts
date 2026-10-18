import { Hono } from 'hono';
import { createTraceId, runWithRequestContext } from '@challenge/shared/trace';
import { CreateTaskSchema } from '../schemas/create-task';
import { QueueService } from '../services/queue';
import type z from 'zod';
import { JobSchema } from '../schemas/job';
import { zValidator } from '../utils/validator';

const taskRoute = new Hono();

taskRoute.post('/create', zValidator('json', CreateTaskSchema), async (c) => {
   const payload = c.req.valid('json');

   type Job = z.infer<typeof JobSchema>;
   const data: Job = {
      ...payload,
      queueTimestamp: Date.now(),
   };
   const job = await runWithRequestContext(
      { traceId: data.traceId ?? createTraceId(), userId: data.userId },
      async () => QueueService.instance.getQueue<Job>('judge-task').add('judge-task', data),
   );

   return c.json(
      {
         message: `Task created and queued successfully`,
         jobId: job!.id,
      },
      201
   );
});

export default taskRoute;
