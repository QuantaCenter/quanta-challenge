import { getHeader } from 'h3';
import {
   MIN_CLI_VERSION,
   isCliVersionSatisfied,
   parseCliVersionFromUserAgent,
} from '@challenge/shared/cli-version';
import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';

/** CLI 版本头；老版本 CLI 没有它，从 user-agent 兜底解析 */
const CLI_VERSION_HEADER = 'x-quanta-cli-version';

/** 版本门槛：过旧的 CLI 直接拦掉；浏览器发布页不带 CLI 标识，不参与校验 */
export const requireCliVersion = middleware(async ({ ctx, next }) => {
   const current =
      getHeader(ctx.event, CLI_VERSION_HEADER) ||
      parseCliVersionFromUserAgent(getHeader(ctx.event, 'user-agent'));
   const required =
      useRuntimeConfig().quanta.minCliVersion || MIN_CLI_VERSION;

   if (current && !isCliVersionSatisfied(current, required)) {
      throw new TRPCError({
         code: 'FORBIDDEN',
         message: `出题 CLI 版本过低：当前 ${current}，服务端要求 >= ${required}。请升级后重试：npm i -g @quantacenter/quanta-problem-cli@latest`,
         cause: { quantaCode: 'CLI_VERSION_TOO_OLD', current, required },
      });
   }

   return next();
});
