import { startJudgeQualityWorker } from '../services/judge-quality-worker';

export default defineNitroPlugin((nitro) => {
   const stop = startJudgeQualityWorker();
   nitro.hooks.hook('close', stop);
});
