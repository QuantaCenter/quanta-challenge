import { collectOrphanAssetFiles } from '../trpc/services/file-assets';
import { logger } from '../utils/logger';

const HOUR_MS = 60 * 60 * 1000;
const GRACE_MS = 24 * HOUR_MS;

export default defineNitroPlugin((nitro) => {
   const timer = setInterval(() => {
      void collectOrphanAssetFiles(new Date(Date.now() - GRACE_MS)).catch((error) => {
         logger.error({ error }, 'Failed to collect orphan asset files');
      });
   }, HOUR_MS);
   timer.unref();
   nitro.hooks.hook('close', () => clearInterval(timer));
});
