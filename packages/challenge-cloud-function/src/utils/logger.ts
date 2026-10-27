import { buildLogger } from '@challenge/shared/logger';
import { getRequestContext } from '@challenge/shared/trace';

/** 日志遵循 docs/LOG_REPORTING_PROTOCOL.md：生产输出 OTel 风格 JSON Lines，开发用 pino-pretty；工厂实现见 @challenge/shared。
 * trace_id 与用户身份由请求上下文（ALS，见 traceMiddleware）经 mixin 自动注入，无需在调用点手传。 */
export const logger = buildLogger({
   serviceName: 'challenge-cloud-function',
   getRequestContext,
});
