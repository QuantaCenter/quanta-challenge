import { Option } from 'commander';
import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import {
   CLOUD_FUNCTION_NAME_ERROR,
   cloudFunctionNameSchema,
} from '../domain/cloud-function';
import { createAdminApi } from '../services/admin-api';
import type { CommandRegistry } from './registry';
import { parseProblemId } from './status';
import { requireSession } from './support';

export interface PublishOptions {
   problemId: string;
   unpublish?: boolean;
   cloudFunction?: string;
   clearCloudFunction?: boolean;
}

export const registerPublishCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('publish')
      .description('发布题目（status: ready → published），或 --unpublish 下架')
      .argument('<problemId>', '题目版本 id')
      .option('--unpublish', '下架（published → ready）')
      .addOption(
         new Option(
            '--cloud-function <name>',
            '确认上传时绑定的云函数名',
         ).conflicts(['unpublish', 'clearCloudFunction']),
      )
      .addOption(
         new Option(
            '--clear-cloud-function',
            '确认题目版本已清除云函数绑定',
         ).conflicts('unpublish'),
      )
      .action(
         async (
            problemId: string,
            options: Omit<PublishOptions, 'problemId'>,
         ) => {
            const ctx = await context();
            await runPublish(ctx, { problemId, ...options });
         },
      );
};

export const runPublish = async (
   ctx: CommandContext,
   options: PublishOptions,
): Promise<void> => {
   const problemId = parseProblemId(options.problemId);
   const cloudFunctionName = options.clearCloudFunction
      ? null
      : options.cloudFunction;
   if (
      typeof cloudFunctionName === 'string' &&
      !cloudFunctionNameSchema.safeParse(cloudFunctionName).success
   ) {
      throw new UsageError(CLOUD_FUNCTION_NAME_ERROR);
   }
   requireSession(ctx);
   const api = createAdminApi(ctx.client);

   // 先看状态：服务端只允许 ready / published 之间切换，
   // 提前拦下"审计还没通过就想发布"可以省一次 400 与一轮困惑。
   const detail = await api.getAuditDetail(problemId);
   const publish = !options.unpublish;
   if (
      cloudFunctionName !== undefined &&
      detail.cloudFunctionName === undefined
   ) {
      throw new UsageError('当前平台版本尚未支持发布时指定云函数');
   }

   const currentPid = detail.BaseProblem?.currentPid;
   if (currentPid && currentPid !== problemId) {
      throw new UsageError(
         `题目 #${problemId} 不是当前版本（当前版本是 #${currentPid}），平台只允许切换当前版本的发布状态`,
         {
            hint: `每次上传都会生成新版本并成为当前版本：改用 \`qpc publish ${currentPid}\`。`,
            details: { code: 'NOT_CURRENT_VERSION', currentPid },
         },
      );
   }

   if (publish && !['ready', 'published'].includes(detail.status)) {
      throw new UsageError(
         `题目 #${problemId} 当前状态是 ${detail.status}，不能发布`,
         {
            hint: '只有审计通过（status=ready）的版本才能发布；先 `qpc status <id> --watch` 看审计结果。',
         },
      );
   }
   if (!publish && detail.status !== 'published') {
      throw new UsageError(
         `题目 #${problemId} 当前状态是 ${detail.status}，无需下架`,
      );
   }

   ctx.logger.step(
      `${publish ? '发布' : '下架'}题目 #${problemId}（${detail.title}）`,
   );
   const result = await api.setStatus(problemId, publish, cloudFunctionName);
   ctx.logger.success(result.message);
   if (publish && result.cloudFunctionName) {
      ctx.logger.info(`  云函数：${result.cloudFunctionName}`);
   }

   if (ctx.logger.json) {
      ctx.logger.result({
         problemId,
         publish,
         status: publish ? 'published' : 'ready',
         message: result.message,
         cloudFunctionName: result.cloudFunctionName,
      });
   }
};
