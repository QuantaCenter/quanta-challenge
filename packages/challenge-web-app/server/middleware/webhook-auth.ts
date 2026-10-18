import { verifyOpenApiSign } from '@challenge/shared/openapi';
import z from 'zod';
import { logger } from '~~/server/utils/logger';

export default defineEventHandler((event) => {
   if (!event.path.startsWith('/api/webhooks/')) return;

   const timestamp = getCookie(event, 'webhook_timestamp');
   if (!timestamp) {
      // pino 的签名是 logger.warn(obj, msg)；参数顺序写反会导致结构化上下文丢失
      logger.warn({ path: event.path }, 'Webhook authentication failed: missing timestamp');
      throw createError({
         statusCode: 403,
         message: 'Missing webhook timestamp',
      });
   }

   const sign = getCookie(event, 'sign');
   if (!sign) {
      logger.warn({ path: event.path }, 'Webhook authentication failed: missing signature');
      throw createError({
         statusCode: 403,
         message: 'Missing webhook signature',
      });
   }

   const { openapi } = useRuntimeConfig();
   const query = getQuery(event);
   const uri = event.path.split('?')[0];

   const verified = verifyOpenApiSign({
      params: query,
      secret: openapi.webhookSecret,
      path: uri,
      signature: sign,
      timestamp: timestamp,
   });

   if (!verified) {
      logger.warn({ path: event.path, query }, 'Webhook authentication failed');
      throw createError({
         statusCode: 403,
         message: 'Invalid webhook signature',
      });
   }
});
