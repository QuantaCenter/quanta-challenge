import { initTRPC } from '@trpc/server';
import z, { ZodError } from 'zod';
import { oauthErrorKind } from '../services/quanta-oauth/rpc-errors';
import type { Context } from './context';
import { log } from './middlewares/log';

/** 只透出带 quantaCode 标记的 cause，避免泄漏内部异常细节 */
const businessErrorDetails = (
   cause: unknown,
): Record<string, unknown> | undefined => {
   if (typeof cause !== 'object' || cause === null) return undefined;
   const { quantaCode, ...rest } = cause as Record<string, unknown>;
   return typeof quantaCode === 'string' ? rest : undefined;
};

const t = initTRPC.context<Context>().create({
   errorFormatter({ shape, error, ctx }) {
      // Zod 4 的 ZodError.message 是所有 issue 的 JSON 串，客户端读不到人话；这里拼成可读文案，结构化明细仍在 data.zodError。
      const zodMessages =
         error.cause instanceof ZodError
            ? error.cause.issues
                 .map((issue) => issue.message)
                 .filter((message) => Boolean(message))
            : [];

      return {
         ...shape,
         message:
            zodMessages.length > 0 ? zodMessages.join('；') : shape.message,
         data: {
            ...shape.data,
            ...businessErrorDetails(error.cause),
            traceId: ctx?.traceId ?? 'unknown',
            quantaOAuthError: oauthErrorKind(error),
            zodError:
               error.cause instanceof ZodError
                  ? z.treeifyError(error.cause)
                  : null,
            stack:
               process.env.NODE_ENV === 'development'
                  ? shape.data.stack
                  : undefined,
         },
      };
   },
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure.use(log());
