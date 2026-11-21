import { resolve } from 'node:path';
import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import {
   CLOUD_FUNCTION_NAME_ERROR,
   cloudFunctionNameSchema,
   cloudFunctionSourceError,
} from '../domain/cloud-function';
import { createAdminApi } from '../services/admin-api';
import { readText } from '../utils/fs';
import type { CommandRegistry } from './registry';
import { requireSession } from './support';

interface CloudFunctionPublishOptions {
   description?: string;
   activate: boolean;
}

export const registerCloudFunctionCommand = ({
   program,
   context,
}: CommandRegistry): void => {
   program
      .command('cloud-function')
      .description('管理云函数')
      .command('publish')
      .description('从本地源码发布云函数版本（函数不存在时创建）')
      .argument('<name>', '云函数名')
      .argument('<file>', '本地 TypeScript 或 JavaScript 源码文件')
      .option('--description <text>', '新建函数时写入的描述')
      .option('--no-activate', '保存版本，保持当前生效版本')
      .action(
         async (
            name: string,
            file: string,
            options: CloudFunctionPublishOptions,
         ) => {
            await runCloudFunctionPublish(await context(), name, file, options);
         },
      );
};

const runCloudFunctionPublish = async (
   ctx: CommandContext,
   name: string,
   file: string,
   options: CloudFunctionPublishOptions,
): Promise<void> => {
   if (!cloudFunctionNameSchema.safeParse(name).success) {
      throw new UsageError(CLOUD_FUNCTION_NAME_ERROR);
   }
   requireSession(ctx);

   const source = await readText(resolve(ctx.cwd, file));
   const sourceError = cloudFunctionSourceError(source);
   if (sourceError) throw new UsageError(`${sourceError}：${file}`);

   const result = await createAdminApi(ctx.client).publishCloudFunction({
      name,
      source,
      activate: options.activate,
      description: options.description,
   });
   const version = `${result.name} v${result.version}`;
   const activation = result.activated ? '已激活' : '未切换生效版本';
   ctx.logger.success(
      `${result.reused ? '已复用' : '已发布'}云函数 ${version}（${activation}）`,
   );
   if (result.activated) {
      ctx.logger.info(
         `${ctx.env.apiUrl}/api/cloud-function/invoke/${result.name}`,
      );
   }
   if (ctx.logger.json) ctx.logger.result(result);
};
