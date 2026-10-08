import { Hono } from 'hono';
import { signatureMiddleware, traceMiddleware } from '../middlewares';
import { CloudFunctionError } from '../utils/errors';
import { logger } from '../utils/logger';
import functionsRoute from './functions';
import healthRoute from './health';
import invokeRoute from './invoke';
import keysRoute from './keys';

const app = new Hono();

app.use('*', traceMiddleware);

// 健康检查不验签（供 compose / 探针使用）。
app.route('/healthz', healthRoute);

// 其余全部走签名。
app.use('/v1/*', signatureMiddleware);
app.route('/v1/invoke', invokeRoute);
app.route('/v1/functions', functionsRoute);
app.route('/v1/keys', keysRoute);

app.notFound((c) =>
   c.json(
      {
         ok: false,
         error: {
            code: 'FUNCTION_NOT_FOUND',
            message: '未知接口',
            traceId: c.get('traceId') ?? null,
         },
      },
      404,
   ),
);

app.onError((error, c) => {
   if (error instanceof CloudFunctionError) {
      return c.json(
         {
            ok: false,
            error: {
               code: error.code,
               message: error.message,
               traceId: c.get('traceId') ?? null,
               details: error.details ?? undefined,
            },
         },
         error.status as never,
      );
   }

   logger.error(
      { error, traceId: c.get('traceId') },
      '云函数服务未处理的错误',
   );

   return c.json(
      {
         ok: false,
         error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal Server Error',
            traceId: c.get('traceId') ?? null,
         },
      },
      500,
   );
});

export default app;
