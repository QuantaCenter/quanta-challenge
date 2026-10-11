import { describe, expect, test } from 'vitest';
import z from 'zod';
import {
   ReuploadSchema,
   resolveBackendServiceRuntime,
   UploadSchema,
} from './publish-schema';

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

   test('后端服务题型：必须自定义封面（没有首屏可截图）', () => {
      const backend = {
         ...valid,
         problemType: 'backend_service' as const,
         initCommand: 'cd ./project && node server.js',
      };
      // 默认封面（首屏截图）在后端题目上永远生成不出来
      expect(UploadSchema.safeParse(backend).success).toBe(false);
      expect(
         UploadSchema.safeParse({
            ...backend,
            coverMode: 'custom' as const,
            coverImageId: 'img-1',
         }).success
      ).toBe(true);
   });

   test('后端服务题型：必须提供初始化命令（服务启动命令）', () => {
      const backend = {
         ...valid,
         problemType: 'backend_service' as const,
         coverMode: 'custom' as const,
         coverImageId: 'img-1',
      };
      // 编辑器与判题容器共用 initCommand，缺失则两边都起不来
      expect(UploadSchema.safeParse(backend).success).toBe(false);
      expect(
         UploadSchema.safeParse({ ...backend, initCommand: '   ' }).success
      ).toBe(false);
      expect(
         UploadSchema.safeParse({
            ...backend,
            initCommand: 'cd ./project && node server.js',
         }).success
      ).toBe(true);
   });

   test('后端服务题型：初始镜像必须是注册表里的 id（不允许自由填镜像名）', () => {
      const backend = {
         ...valid,
         problemType: 'backend_service' as const,
         coverMode: 'custom' as const,
         coverImageId: 'img-1',
         initCommand: 'cd ./project && node server.js',
      };
      expect(
         UploadSchema.safeParse({ ...backend, serviceImage: 'node-24' }).success
      ).toBe(true);
      // 自由填写镜像名 / 空串都不再接受：镜像决定了容器内的安装与启动命令
      expect(
         UploadSchema.safeParse({ ...backend, serviceImage: 'node:24-slim' })
            .success
      ).toBe(false);
      expect(
         UploadSchema.safeParse({ ...backend, serviceImage: '' }).success
      ).toBe(false);
      // 不传时由服务端回落到默认镜像
      expect(UploadSchema.safeParse(backend).success).toBe(true);
   });

   test('后端服务的镜像与 bootCommand 由注册表收敛（服务端才是真正的锁）', () => {
      // 两步：先装 pnpm（版本与容器镜像一致），再用 pnpm 装依赖
      const bootCommandOf = (mountPath: string) =>
         [
            '[install-pnpm] npm install --global pnpm@9.15.9',
            `[install] pnpm --dir ./${mountPath} install`,
         ].join('\n');

      const runtime = resolveBackendServiceRuntime({
         judgeUploadPath: 'project',
      });
      expect(runtime.serviceImage).toBe('node-24');
      expect(runtime.servicePort).toBe(3000);
      expect(runtime.bootCommand).toBe(bootCommandOf('project'));
      // initCommand 是可自定义的（镜像只提供默认值），不在这里收敛
      expect(runtime).not.toHaveProperty('initCommand');
      // 后端题的代码跑在判题容器里，那里不签发云函数令牌
      expect(runtime.enableCloudFunction).toBe(false);

      // 挂载目录变了，命令要跟着变（编辑器与容器都相对挂载根执行）
      expect(
         resolveBackendServiceRuntime({ judgeUploadPath: 'app' }).bootCommand
      ).toBe(bootCommandOf('app'));

      const fixed = resolveBackendServiceRuntime({
         serviceImage: 'node-24',
         servicePort: 8080,
         judgeUploadPath: 'project',
      });
      expect(fixed.servicePort).toBe(8080);
      expect(fixed.bootCommand).toBe(bootCommandOf('project'));
   });
});
