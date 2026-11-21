import type { JudgeResultSchema } from '@challenge/judge-machine-agent/schemas';
import type { JobSchema } from '../schemas/job';
import type z from 'zod';
import type { Job } from 'bullmq';

export enum EventType {
   JUDGE_FINISHED = 'judge_finished',
   TASK_COMPLETED = 'task_completed',
   TASK_FAILED = 'task_failed',
   TASK_ERROR = 'task_error',
}

export type JobType = z.infer<typeof JobSchema>;
export type JudgeResultType = z.infer<typeof JudgeResultSchema>;
export interface JudgeMachineResult {
   socket: WebSocket;
   result: JudgeResultType;
}
export type ProcessResultType = {
   judgeRecordId: number;
   jobId?: string;
   message: string;
   status: 'completed' | 'failed' | 'skipped';
};

export interface ITaskCompletedPayload {
   job: Job<JobType>;
   result: ProcessResultType;
}

export interface ITaskFailedPayload {
   job: Job<JobType>;
   err: Error;
}

export interface ITaskErrorPayload {
   err: Error;
}
