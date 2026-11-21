import { randomUUID } from 'node:crypto';
import type { WSContext } from 'hono/ws';
import type { BrowserContext } from 'playwright';
import type z from 'zod';
import {
   type CloudFunctionInvokeSchema,
   CloudFunctionResultSchema,
} from '../schemas/cloud-function.js';

type JudgeSocket = WSContext<WebSocket>;
type Reply = Pick<z.infer<typeof CloudFunctionResultSchema>, 'status' | 'body'>;
type Phase = z.infer<typeof CloudFunctionInvokeSchema>['phase'];
type Invoke = (input: unknown) => Promise<Reply>;

const RPC_TIMEOUT_MS = 11_000;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_PENDING_PER_CONTEXT = 16;
const CLOUD_FUNCTION_PATH = '/api/cloud-function/';
const CLOUD_FUNCTION_URL = /^https?:\/\/[^/]+\/api\/cloud-function\//;

const fail = (status: number, code: string, message: string): Reply => ({
   status,
   body: { ok: false, error: { code, message } },
});

const unavailable = () => fail(503, 'INTERNAL_ERROR', '云函数判题会话已关闭');

export class JudgeCloudFunctions {
   private readonly pending = new Map<string, {
      ws: JudgeSocket;
      judgeRecordId: number;
      settle: (reply: Reply) => void;
   }>();

   receive(ws: JudgeSocket, message: unknown): void {
      const parsed = CloudFunctionResultSchema.safeParse(message);
      if (!parsed.success) return;
      const { requestId, judgeRecordId, status, body } = parsed.data;
      const entry = this.pending.get(requestId);
      if (entry?.ws === ws && entry.judgeRecordId === judgeRecordId) {
         entry.settle({ status, body });
      }
   }

   closeSocket(ws: JudgeSocket): void {
      for (const request of this.pending.values()) {
         if (request.ws === ws) request.settle(unavailable());
      }
   }

   createSession(ws: JudgeSocket, judgeRecordId: number, phase?: Phase) {
      const active = new Set<string>();
      let closed = false;

      const invoke: Invoke = (input) => {
         if (closed || ws.readyState !== 1) return Promise.resolve(unavailable());
         if (active.size >= MAX_PENDING_PER_CONTEXT) {
            return Promise.resolve(fail(429, 'FUNCTION_BUSY', '云函数请求过多'));
         }

         const requestId = randomUUID();
         return new Promise((resolve) => {
            const settle = (reply: Reply) => {
               clearTimeout(timer);
               this.pending.delete(requestId);
               active.delete(requestId);
               resolve(reply);
            };
            const timer = setTimeout(() => {
               settle(fail(504, 'TIMEOUT', '云函数判题调用超时'));
            }, RPC_TIMEOUT_MS);
            active.add(requestId);
            this.pending.set(requestId, { ws, judgeRecordId, settle });

            try {
               const message = {
                  type: 'cloud-function-invoke',
                  judgeRecordId,
                  requestId,
                  phase,
                  input,
               } satisfies z.infer<typeof CloudFunctionInvokeSchema>;
               ws.send(JSON.stringify(message));
            } catch {
               settle(unavailable());
            }
         });
      };

      const close = () => {
         closed = true;
         for (const requestId of active) this.pending.get(requestId)?.settle(unavailable());
      };

      return { invoke, close };
   }
}

/** 在导航前注册，让参考页面仍然使用标准调用地址和 JSON 协议。 */
export const routeJudgeCloudFunction = async (
   context: BrowserContext,
   name: string,
   invoke: Invoke,
): Promise<void> => {
   await context.route(CLOUD_FUNCTION_URL, async (route) => {
      const request = route.request();
      const requestHeaders = request.headers();
      const headers = {
         'access-control-allow-origin': requestHeaders.origin ?? '*',
         'access-control-allow-headers': 'authorization, content-type',
         'access-control-allow-methods': 'POST, OPTIONS',
         'cross-origin-resource-policy': 'cross-origin',
         'cache-control': 'no-store',
      };
      const respond = ({ status, body }: Reply) => route.fulfill({ status, headers, json: body });
      if (request.method() === 'OPTIONS') {
         await route.fulfill({ status: 204, headers });
         return;
      }
      const pathname = new URL(request.url()).pathname;
      if (
         pathname !== `${CLOUD_FUNCTION_PATH}invoke/${name}` &&
         (name === 'token' || pathname !== `${CLOUD_FUNCTION_PATH}${name}`)
      ) {
         await respond(fail(403, 'FORBIDDEN', '判题仅可调用题目绑定的云函数'));
         return;
      }
      if (request.method() !== 'POST') {
         await respond(fail(405, 'INVALID_INPUT', '只支持 POST'));
         return;
      }
      if (!requestHeaders['content-type']?.includes('application/json')) {
         await respond(fail(415, 'INVALID_INPUT', 'Content-Type 必须是 application/json'));
         return;
      }
      const raw = request.postData();
      if (raw && Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) {
         await respond(fail(413, 'INVALID_INPUT', '云函数请求体过大'));
         return;
      }

      let input: unknown;
      try {
         const body = JSON.parse(raw ?? 'null') as { input?: unknown } | null;
         input = body?.input ?? null;
      } catch {
         await respond(fail(400, 'INVALID_INPUT', '请求体必须是合法的 JSON'));
         return;
      }

      await respond(await invoke(input));
   });
};
