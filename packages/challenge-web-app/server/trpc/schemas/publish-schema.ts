import { Difficulty } from '@prisma/client';
import z from 'zod';

export const difficulties: Difficulty[] = [
   'easy',
   'medium',
   'hard',
   'very_hard',
] as const;

/**
 * 快照是否真的"有内容"。
 *
 * 不能写 `Boolean(snapshot)`：**空对象 {} 是 truthy**，
 * 而重新发布页在回填前会把参考答案初始化成 `{}` —— 那样"默认封面必须提供参考答案"
 * 的校验会被空对象蒙过去，最后存进一份空快照。
 */
const hasEntries = (snapshot?: Record<string, string>) =>
   !!snapshot && Object.keys(snapshot).length > 0;

/**
 * 题目提交表单的公共字段（upload 与 reupload 共用同一套）。
 *
 * 文案统一用中文、并说清"该怎么办"：这些消息会被 tRPC 的 errorFormatter 拼成一句
 * 直接显示在发布页的提示里（服务端只读 error.message，不再甩 Zod 的 JSON）。
 */
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
   initCommand: z.string().optional(),
   buildCommand: z.string().optional(),
   // 打包上传路径是判题容器的站点根目录，空串会让判题直接找不到页面。
   // 表单侧本来就有"必填"规则，这里补上服务端校验，避免空串被静默写进库。
   judgeUploadPath: z.string().min(1, '必须填写打包上传路径'),
};

/**
 * 给任意"基于 uploadShape 的对象 schema"套上跨字段校验。
 *
 * ⚠️ 必须抽成函数、两条路径都调用，不能只在 UploadSchema 上 `.refine()`：
 * `z.object({ baseId }).extend(UploadSchema.shape)` **不会继承 `.refine()`**，
 * 于是 reupload（编辑/重新发布页走的就是它）会完全没有校验 ——
 * 实测过：UploadSchema 拒绝空参考答案，ReuploadSchema 却放行，
 * 结果"默认封面 + 空参考答案"能一路写到创建审计任务那一步。
 */
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
      );

/** 上传新题目 */
export const UploadSchema = withUploadRefinements(z.object(uploadShape));

/** 重新发布（在已有 baseProblem 上创建新版本） */
export const ReuploadSchema = withUploadRefinements(
   z.object(uploadShape).extend({
      baseId: z.number('Base Problem ID must be a number').int(),
   })
);
