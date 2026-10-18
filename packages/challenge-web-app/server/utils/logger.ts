import { buildLogger } from '@challenge/shared/logger';
import { getRequestContext } from '@challenge/shared/trace';

export const logger = buildLogger({
   serviceName: 'challenge-web-app',
   getRequestContext,
});
