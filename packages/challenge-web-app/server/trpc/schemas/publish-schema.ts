import {
   BACKEND_SERVICE_IMAGE_IDS,
   buildBackendBootCommand,
   DEFAULT_BACKEND_SERVICE_IMAGE_ID,
   getBackendServiceDefaultPort,
   type BackendServiceImageId,
} from '@challenge/shared/backend-service-image';
import { Difficulty } from '@prisma/client';
import z from 'zod';

export const difficulties: Difficulty[] = [
   'easy',
   'medium',
   'hard',
   'very_hard',
] as const;

const hasEntries = (snapshot?: Record<string, string>) =>
   !!snapshot && Object.keys(snapshot).length > 0;

const uploadShape = {
   title: z.string().min(1, '题目名称不能为空'),
   detail: z.string().min(1, '题目描述不能为空'),
   tagIds: z.number().array().min(1, '至少选择 1 个标签'),
   judgeScript: z.string().nonempty('判题脚本不能为空'),
   difficulty: z.enum(difficulties, { error: '难度不合法' }),
   totalScore: z.number().min(1, '总分必须大于 0'),
   answerTemplateSnapshot: z.record(
      z.string(),
      z.string(),
      '答题模板快照不合法'
   ),
   referenceAnswerSnapshot: z
      .record(z.string(), z.string(), '参考答案快照不合法')
      .optional(),
   coverMode: z.enum(['default', 'custom']),
   coverImageId: z.string().optional(),
   bootCommand: z.string().optional(),
   initCommand: z.string().trim().min(1, '初始化命令不能为空'),
   buildCommand: z.string().optional(),
   judgeUploadPath: z.string().min(1, '必须填写打包上传路径'),
   enableCloudFunction: z.boolean().optional(),
   /** 题型：前端（默认）或后端服务 */
   problemType: z.enum(['frontend', 'backend_service']).optional(),
   /** 后端服务：初始镜像 id（不是 docker 镜像名，取值见 @challenge/shared/backend-service-image） */
   serviceImage: z.enum(BACKEND_SERVICE_IMAGE_IDS).optional(),
   /** 后端服务：服务监听端口 */
   servicePort: z.number().int().positive().max(65535).optional(),
};

const withUploadRefinements = <T extends z.ZodType>(schema: T) =>
   schema
      .refine(
         (data: any) => {
            return data.coverMode === 'default'
               ? hasEntries(data.referenceAnswerSnapshot)
               : true;
         },
         {
            error: '使用首屏截图作为封面时必须提供参考答案，请重新上传参考答案文件夹（服务端不会保存它，因此无法自动回填）',
         }
      )
      .refine(
         (data: any) => {
            return data.coverMode === 'custom'
               ? Boolean(data.coverImageId)
               : true;
         },
         { error: '自定义封面时必须选择一张封面图片' }
      )
      // 后端服务没有「首屏」可截，默认封面（首屏截图）永远生成不出来，
      // 若允许选择会在题目详情页显示一张 404 的封面，因此在这里直接拦掉。
      .refine(
         (data: any) => {
            return data.problemType === 'backend_service'
               ? data.coverMode === 'custom'
               : true;
         },
         { error: '后端服务题型必须使用自定义封面（没有首屏可截图）' }
      );

export const resolveBackendServiceRuntime = (input: {
   serviceImage?: BackendServiceImageId;
   servicePort?: number;
   judgeUploadPath: string;
}) => {
   const serviceImage = input.serviceImage ?? DEFAULT_BACKEND_SERVICE_IMAGE_ID;
   const mountPath = input.judgeUploadPath || 'project';
   return {
      serviceImage,
      servicePort:
         input.servicePort ?? getBackendServiceDefaultPort(serviceImage),
      bootCommand: buildBackendBootCommand(serviceImage, mountPath),
      enableCloudFunction: false,
   };
};

/** 上传新题目 */
export const UploadSchema = withUploadRefinements(z.object(uploadShape));

/** 重新发布（在已有 baseProblem 上创建新版本） */
export const ReuploadSchema = withUploadRefinements(
   z.object(uploadShape).extend({
      baseId: z.number('Base Problem ID must be a number').int(),
   })
);
