import { initTRPC } from '@trpc/server';
import { Context } from './context';
import { log } from './middlewares/log';
import z, { ZodError } from 'zod';

const t = initTRPC.context<Context>().create({
   errorFormatter({ shape, error, ctx }) {
      // Zod 4 把 ZodError.message 变成了「所有 issue 的 JSON 字符串」，
      // 而客户端（表单）只读 error.message —— 于是用户看到的是
      // [{"code":"custom","path":[],"message":"..."}] 这种东西。
      // 这里把 issue 的 message 拼成一句人话；结构化明细仍然放在 data.zodError 里。
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
            traceId: ctx?.traceId ?? 'unknown',
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
