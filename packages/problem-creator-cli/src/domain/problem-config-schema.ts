import { z } from 'zod';

/** 与 packages/challenge-web-app/server/trpc/schemas/publish-schema.ts 保持一致 */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DEFAULT_CONFIG_FILES = [
   'problem.config.ts',
   'problem.config.mts',
   'problem.config.js',
   'problem.config.mjs',
   'problem.config.json',
] as const;

/** 默认站点根目录：live-server 镜像与 initCommand 都以 `project` 为根 */
export const DEFAULT_JUDGE_UPLOAD_PATH = 'project';
export const DEFAULT_INIT_COMMAND = 'npx serve -l 3000 project';

/** 题型：前端（静态站点 + Playwright）或后端服务（常驻进程 + HTTP 判题） */
export const PROBLEM_TYPES = ['frontend', 'backend_service'] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

export const coverSchema = z.union([
   z.object({ mode: z.literal('default') }),
   z.object({ mode: z.literal('custom'), imageId: z.string().min(1) }),
]);

export const problemConfigSchema = z.object({
   title: z.string().min(1, 'title 不能为空'),
   /** 题型；缺省为前端，老题目不需要改配置 */
   type: z.enum(PROBLEM_TYPES).default('frontend'),
   /** 题面正文；与 detailFile 二选一 */
   detail: z.string().min(1).optional(),
   /** 题面文件（相对题目目录），便于把长题面单独放一个 markdown */
   detailFile: z.string().min(1).optional(),
   difficulty: z.enum(DIFFICULTIES),
   tagIds: z
      .array(z.number().int().positive())
      .min(1, 'tagIds 至少需要一个标签（库中现有 1 = Vue3）'),
   /** 留空表示"以判题脚本里各检查点之和为准"；填写则必须与之和相等 */
   totalScore: z.number().int().positive().optional(),
   cover: coverSchema.default({ mode: 'default' }),
   runtime: z
      .object({
         /** 判题时打包上传的目录，同时决定快照挂载路径（快照键为 `/<judgeUploadPath>/...`） */
         judgeUploadPath: z.string().min(1).default(DEFAULT_JUDGE_UPLOAD_PATH),
         initCommand: z.string().min(1).default(DEFAULT_INIT_COMMAND),
         buildCommand: z.string().min(1).optional(),
         bootCommand: z.string().min(1).optional(),
         /** 后端服务：用户服务跑在哪个镜像里；空则用调度器默认镜像 */
         serviceImage: z.string().min(1).optional(),
         /** 后端服务：服务监听端口（也是判题机请求的端口） */
         servicePort: z.number().int().positive().max(65535).default(3000),
      })
      .default({
         judgeUploadPath: DEFAULT_JUDGE_UPLOAD_PATH,
         initCommand: DEFAULT_INIT_COMMAND,
         servicePort: 3000,
      }),
   paths: z
      .object({
         template: z.string().min(1).default('template'),
         answer: z.string().min(1).default('answer'),
         judge: z.string().min(1).default('judge.js'),
      })
      .default({ template: 'template', answer: 'answer', judge: 'judge.js' }),
});

export type ProblemConfigInput = z.input<typeof problemConfigSchema>;
export type ProblemConfig = z.output<typeof problemConfigSchema>;
