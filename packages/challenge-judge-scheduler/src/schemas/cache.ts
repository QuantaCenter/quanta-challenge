import z from 'zod';

export const CacheUpdateSchema = z.object({
   source: z.enum(['external', 'internal']),
   project: z.string().min(1).optional(),
   packages: z.array(z.string().min(1)).min(1).optional(),
   /** 用哪个题目镜像预热；缺省取 PNPM_CACHE_PROBLEM_IMAGE。 */
   image: z.string().min(1).optional(),
});

/** 门禁校验：用题目镜像起一个断网 + 只读 store 的容器，跑 --offline 安装。 */
export const CacheVerifySchema = z.object({
   project: z.string().min(1),
   image: z.string().min(1).optional(),
});

export type CacheUpdateInput = z.infer<typeof CacheUpdateSchema>;
export type CacheVerifyInput = z.infer<typeof CacheVerifySchema>;
