import { getServerMetrics } from '../utils/metrics';

/** Prometheus 抓取入口（目标配置在 challenge-observation 的 backends.json） */
export default defineEventHandler(async (event) => {
   const { registry } = getServerMetrics();
   setHeader(event, 'content-type', registry.contentType);
   return await registry.metrics();
});
