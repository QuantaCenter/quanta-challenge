import type { CommandContext } from '../core/context';
import { AuthError } from '../core/errors';
import { confirm } from '../utils/terminal';

/** 所有需要登录的命令都从这里过一道，错误信息才统一 */
export const requireSession = (ctx: CommandContext): void => {
   if (!ctx.client.hasSession) {
      throw new AuthError('尚未登录', {
         hint: `先执行 \`qpc login --api ${ctx.env.apiUrl}\`（或设置 QUANTA_TOKEN）。`,
      });
   }
};

export const summarizeUser = (user: {
   nickname?: string;
   email?: string;
   role?: string;
}): string =>
   [user.nickname, user.email, user.role].filter(Boolean).join(' · ') ||
   '<unknown>';

/** 交互确认（仅在改服务端状态的命令里用）：--yes 直接放行；非 TTY 且无 --yes 也放行，避免 CI 卡死并记录"已跳过确认"。 */
export const confirmOrSkip = async (
   ctx: CommandContext,
   question: string,
): Promise<boolean> => {
   if (ctx.assumeYes) return true;
   if (!ctx.runtime.stdin.isTTY) {
      ctx.logger.detail('非交互环境，已跳过确认（--yes 可显式声明）');
      return true;
   }
   return confirm(question, {
      stdin: ctx.runtime.stdin,
      stderr: ctx.runtime.stderr,
   });
};
