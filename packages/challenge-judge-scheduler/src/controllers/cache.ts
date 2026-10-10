import { Hono } from 'hono';
import { CacheUpdateSchema, CacheVerifySchema } from '../schemas/cache';
import {
   PNPM_VERSION,
   PROBLEM_CONTAINER_STORE_PATH,
   PnpmCacheService,
} from '../services/pnpm-cache';
import { zValidator } from '../utils/validator';

const cacheRoute = new Hono();

/** 缓存现状：路径、pnpm 版本、上游、包数量与体积、上次预热的镜像元数据。 */
cacheRoute.get('/', async (c) => {
   const svc = PnpmCacheService.instance;
   return c.json({
      cacheDir: svc.cacheDir,
      problemContainerStorePath: PROBLEM_CONTAINER_STORE_PATH,
      problemImage: svc.problemImage || null,
      pnpmVersion: PNPM_VERSION,
      registries: {
         external: svc.externalRegistry,
         internal: svc.internalRegistry,
      },
      meta: await svc.readMeta(),
      stats: await svc.stats(),
   });
});

/** 更新缓存：从 external / internal 上游把 project 或 packages 预热进 store。 */
cacheRoute.post('/update', zValidator('json', CacheUpdateSchema), async (c) => {
   const payload = c.req.valid('json');
   const result = await PnpmCacheService.instance.update(payload);
   return c.json(result);
});

/** 门禁：用题目镜像起断网 + 只读 store 的容器，跑 --offline 安装；缓存过期会直接拒绝。 */
cacheRoute.post('/verify', zValidator('json', CacheVerifySchema), async (c) => {
   const payload = c.req.valid('json');
   const result = await PnpmCacheService.instance.verify(payload);
   return c.json(result);
});

export default cacheRoute;
