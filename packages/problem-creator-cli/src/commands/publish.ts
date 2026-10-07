import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import { createAdminApi } from '../services/admin-api';
import type { CommandRegistry } from './registry';
import { parseProblemId } from './status';
import { requireSession } from './support';

export interface PublishOptions {
   problemId: string;
   unpublish?: boolean;
}

export const registerPublishCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('publish')
      .description('发布题目（status: ready → published），或 --unpublish 下架')
      .argument('<problemId>', '题目版本 id')
      .option('--unpublish', '下架（published → ready）')
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
   requireSession(ctx);
   const api = createAdminApi(ctx.client);

   // 先看状态：服务端只允许 ready / published 之间切换，
   // 提前拦下"审计还没通过就想发布"可以省一次 400 与一轮困惑。
   const detail = await api.getAuditDetail(problemId);
   const publish = !options.unpublish;

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
   const result = await api.setStatus(problemId, publish);
   ctx.logger.success(result.message);

   if (ctx.logger.json) {
      ctx.logger.result({
         problemId,
         publish,
         status: publish ? 'published' : 'ready',
         message: result.message,
      });
   }
};
