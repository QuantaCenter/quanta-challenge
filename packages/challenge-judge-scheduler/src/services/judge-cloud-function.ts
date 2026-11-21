import { randomUUID } from 'node:crypto';
import {
   CloudFunctionInvokeSchema,
   type CloudFunctionResultSchema,
} from '@challenge/judge-machine-agent/schemas';
import { generateCloudFunctionHeaders } from '@challenge/shared/cloud-function';
import type z from 'zod';
import { logger } from '../utils/logger';

type JudgeSocket = Pick<WebSocket, 'readyState' | 'send'>;
type InvokeMessage = z.infer<typeof CloudFunctionInvokeSchema>;
type InvokeResponse = Pick<z.infer<typeof CloudFunctionResultSchema>, 'status' | 'body'>;

const MAX_INPUT_BYTES = 256 * 1024;
const MAX_CONCURRENT_CALLS = 16;
const MAX_CALLS_PER_TASK = 256;
const INVOKE_TIMEOUT_MS = 9_000;

const failure = (status: number, code: string, message: string): InvokeResponse => ({
   status,
   body: { ok: false, error: { code, message } },
});

interface BoundTask {
   judgeRecordId: number;
   name: string;
   traceId?: string;
   designCapture: boolean;
}

interface ActiveTask extends BoundTask {
   runId: string;
   designRunId?: string;
   abort: AbortController;
   requests: Set<string>;
   inFlight: number;
}

/** 只接受发给当前判题连接的活跃任务。函数名和运行身份由调度器决定。 */
export class JudgeCloudFunctionRelay {
   private readonly tasks = new WeakMap<JudgeSocket, Map<number, ActiveTask>>();

   constructor(private readonly fetchCloud: typeof fetch = fetch) {}

   register(socket: JudgeSocket, options: BoundTask): () => void {
      const active = this.tasks.get(socket) ?? new Map<number, ActiveTask>();
      if (active.has(options.judgeRecordId)) {
         throw new Error('判题云函数任务已在运行');
      }
      const task: ActiveTask = {
         ...options,
         runId: randomUUID(),
         designRunId: options.designCapture ? randomUUID() : undefined,
         abort: new AbortController(),
         requests: new Set(),
         inFlight: 0,
      };
      active.set(task.judgeRecordId, task);
      this.tasks.set(socket, active);

      return () => {
         if (active.get(task.judgeRecordId) === task) active.delete(task.judgeRecordId);
         task.abort.abort();
      };
   }

   close(socket: JudgeSocket): void {
      const active = this.tasks.get(socket);
      this.tasks.delete(socket);
      for (const task of active?.values() ?? []) task.abort.abort();
      active?.clear();
   }

   async handle(socket: JudgeSocket, raw: string): Promise<void> {
      const active = this.tasks.get(socket);
      if (!active?.size || Buffer.byteLength(raw) > MAX_INPUT_BYTES + 512) return;

      let json: unknown;
      try {
         json = JSON.parse(raw);
      } catch {
         return;
      }
      const parsed = CloudFunctionInvokeSchema.safeParse(json);
      if (!parsed.success) return;

      const request = parsed.data;
      const task = active.get(request.judgeRecordId);
      if (!task || task.requests.has(request.requestId)) return;

      const runId = request.phase === 'design' ? task.designRunId : task.runId;
      if (!runId) {
         this.reply(socket, task, request, failure(403, 'FORBIDDEN', '任务未启用设计稿采集'));
         return;
      }
      if (task.inFlight >= MAX_CONCURRENT_CALLS || task.requests.size >= MAX_CALLS_PER_TASK) {
         this.reply(socket, task, request, failure(429, 'FUNCTION_BUSY', '判题云函数调用数达到上限'));
         return;
      }

      let inputJson: string;
      try {
         inputJson = JSON.stringify(request.input ?? null);
      } catch {
         this.reply(socket, task, request, failure(400, 'INVALID_INPUT', '判题云函数输入无法序列化'));
         return;
      }
      if (Buffer.byteLength(inputJson) > MAX_INPUT_BYTES) {
         this.reply(socket, task, request, failure(413, 'INVALID_INPUT', '判题云函数输入超过 256 KiB'));
         return;
      }

      task.requests.add(request.requestId);
      task.inFlight += 1;
      try {
         const response = await this.invoke(task, runId, inputJson);
         this.reply(socket, task, request, response);
      } finally {
         task.inFlight -= 1;
      }
   }

   private reply(socket: JudgeSocket, task: ActiveTask, request: InvokeMessage, response: InvokeResponse) {
      if (task.abort.signal.aborted || socket.readyState !== WebSocket.OPEN) return;
      const result = {
         type: 'cloud-function-result',
         judgeRecordId: task.judgeRecordId,
         requestId: request.requestId,
         ...response,
      } satisfies z.infer<typeof CloudFunctionResultSchema>;
      try {
         socket.send(JSON.stringify(result));
      } catch (error) {
         logger.warn({ err: error, judgeRecordId: task.judgeRecordId, trace_id: task.traceId }, '判题云函数回包失败');
      }
   }

   private async invoke(task: ActiveTask, runId: string, inputJson: string): Promise<InvokeResponse> {
      const server = process.env.CF_SERVER;
      const secret = process.env.CF_INTERNAL_SECRET;
      const keyId = process.env.CF_INTERNAL_KEY_ID ?? 'judge';
      if (!server || !secret) {
         return failure(503, 'INTERNAL_ERROR', '判题调度器未配置云函数服务');
      }

      const path = `/v1/invoke/${encodeURIComponent(task.name)}/judge`;
      const body = `{"input":${inputJson},"judgeRecordId":${task.judgeRecordId},"runId":${JSON.stringify(runId)}}`;
      const timeout = AbortSignal.timeout(INVOKE_TIMEOUT_MS);
      try {
         const headers = generateCloudFunctionHeaders({ method: 'POST', path, body, keyId, secret });
         if (task.traceId) headers['x-trace-id'] = task.traceId;
         const response = await this.fetchCloud(new URL(path, server), {
            method: 'POST',
            headers,
            body,
            redirect: 'error',
            signal: AbortSignal.any([task.abort.signal, timeout]),
         });
         const payload = await response.json() as {
            ok?: boolean;
            data?: unknown;
            error?: { code?: string; message?: string };
         } | null;
         if (response.ok && payload?.ok === true) {
            return { status: 200, body: { ok: true, data: payload.data ?? null } };
         }
         if (response.status >= 400 && payload?.ok === false &&
            typeof payload.error?.code === 'string' && typeof payload.error.message === 'string') {
            return failure(response.status, payload.error.code, payload.error.message);
         }
         return failure(502, 'INTERNAL_ERROR', '云函数服务返回了无效响应');
      } catch (error) {
         if (!task.abort.signal.aborted) {
            logger.warn({ err: error, judgeRecordId: task.judgeRecordId, trace_id: task.traceId }, '调用判题云函数服务失败');
         }
         return timeout.aborted
            ? failure(504, 'TIMEOUT', '判题云函数请求超时')
            : failure(502, 'INTERNAL_ERROR', '无法调用判题云函数服务');
      }
   }
}

export const judgeCloudFunctions = new JudgeCloudFunctionRelay();
