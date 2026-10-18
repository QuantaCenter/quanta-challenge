import { buildLogger } from '@challenge/shared/logger';

/** 日志遵循 docs/LOG_REPORTING_PROTOCOL.md：生产输出 OTel 风格 JSON Lines，开发用 pino-pretty；工厂实现见 @challenge/shared。 */
export const logger = buildLogger({ serviceName: 'challenge-judge-scheduler' });
