import type { Scope } from './config';

export interface Caller {
   keyId: string;
   type: 'internal' | 'apiKey';
   scopes: Scope[];
   allowedFunctions: string[];
   restricted: boolean;
   /**
    * 调用所代表的用户。**仅内部调用方**可信（外部 API Key 无法伪造）。
    */
   userId: string | null;
}

declare module 'hono' {
   interface ContextVariableMap {
      caller: Caller;
      /** 中间件读取过一次的请求体（供签名校验与控制器共用）。 */
      rawBody: string;
      traceId: string;
   }
}
