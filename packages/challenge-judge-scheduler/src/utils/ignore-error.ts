import { logger } from './logger';

export const ignoreError = async <T>(
   fn: () => Promise<T>
): Promise<T | null> => {
   return fn().catch((error) => {
      logger.error({ err: error }, 'An error occurred');
      return null;
   });
};
