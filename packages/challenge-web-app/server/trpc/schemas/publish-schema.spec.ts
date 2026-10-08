import { describe, expect, test } from 'vitest';
import z from 'zod';
import { ReuploadSchema, UploadSchema } from './publish-schema';

type UploadInput = z.input<typeof UploadSchema>;
type ReuploadInput = z.input<typeof ReuploadSchema>;

const valid: UploadInput = {
   title: '标题标题标题标题标题标题',
   detail: '题目描述',
   tagIds: [1],
   judgeScript: 'export default () => true',
   difficulty: 'easy',
   totalScore: 100,
   answerTemplateSnapshot: { '/answer-template/main.py': 'print(1)' },
   referenceAnswerSnapshot: { '/main.py': 'print(1)' },
   coverMode: 'default',
   judgeUploadPath: 'project',
};

const validReupload: ReuploadInput = { ...valid, baseId: 1 };

describe('UploadSchema / ReuploadSchema', () => {
   test('合法输入在两条路径上都通过', () => {
      expect(UploadSchema.safeParse(valid).success).toBe(true);
      expect(ReuploadSchema.safeParse(validReupload).success).toBe(true);
   });

   test('默认封面 + 空参考答案：两条路径都必须拒绝', () => {
      // 回归：ReuploadSchema 原先用 `.extend(UploadSchema.shape)` 拼，
      // 而 extend **不继承 refine** —— 于是编辑/重新发布完全绕过校验，
      // "默认封面 + 空参考答案"能一路写到创建审计任务，参考答案被静默清空。
      for (const schema of [UploadSchema, ReuploadSchema]) {
         const input =
            schema === UploadSchema
               ? { ...valid, referenceAnswerSnapshot: {} }
               : { ...validReupload, referenceAnswerSnapshot: {} };
         expect(schema.safeParse(input).success).toBe(false);
      }
   });

   test('默认封面 + 完全不带参考答案：两条路径都必须拒绝', () => {
      const { referenceAnswerSnapshot: _omit, ...without } = valid;
      expect(UploadSchema.safeParse(without).success).toBe(false);
      expect(
         ReuploadSchema.safeParse({ ...without, baseId: 1 }).success
      ).toBe(false);
   });

   test('自定义封面不要求参考答案，但必须有封面图 id', () => {
      const custom = {
         ...valid,
         coverMode: 'custom' as const,
         referenceAnswerSnapshot: {},
      };
      expect(UploadSchema.safeParse(custom).success).toBe(false); // 缺 coverImageId

      const withCover = { ...custom, coverImageId: 'img-1' };
      expect(UploadSchema.safeParse(withCover).success).toBe(true);
      expect(
         ReuploadSchema.safeParse({ ...withCover, baseId: 1 }).success
      ).toBe(true);
   });

   test('打包上传路径不能是空串（两条路径）', () => {
      expect(
         UploadSchema.safeParse({ ...valid, judgeUploadPath: '' }).success
      ).toBe(false);
      expect(
         ReuploadSchema.safeParse({ ...validReupload, judgeUploadPath: '' })
            .success
      ).toBe(false);
   });

   test('reupload 仍然要求 baseId', () => {
      const { baseId: _omit, ...withoutBaseId } = validReupload;
      expect(ReuploadSchema.safeParse(withoutBaseId).success).toBe(false);
   });

   test('运行期配置字段可省略（编辑旧题目时库里可能为空）', () => {
      const withoutCommands = {
         ...valid,
         bootCommand: undefined,
         initCommand: undefined,
         buildCommand: undefined,
      };
      expect(UploadSchema.safeParse(withoutCommands).success).toBe(true);
   });

   test('是否使用云函数：可省略（默认不使用），但传了就必须是布尔值', () => {
      expect(UploadSchema.safeParse(valid).success).toBe(true);
      expect(
         UploadSchema.safeParse({ ...valid, enableCloudFunction: true })
            .success
      ).toBe(true);
      expect(
         ReuploadSchema.safeParse({
            ...validReupload,
            enableCloudFunction: false,
         }).success
      ).toBe(true);
      expect(
         UploadSchema.safeParse({ ...valid, enableCloudFunction: 'yes' })
            .success
      ).toBe(false);
   });
});
