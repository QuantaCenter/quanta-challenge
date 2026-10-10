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

/** 服务端可能把没有的字段回成 null（例如用户名登录的账号没有 email），这里都要能吃下 */
export const summarizeUser = (user: {
   nickname?: string | null;
   email?: string | null;
   role?: string | null;
}): string =>
   [user.nickname, user.email, user.role].filter(Boolean).join(' · ') ||
   '<unknown>';

/**
 * 交互确认。
 *
 * 只在"确实要改服务端状态"的命令里用，并且：
 *   · --yes 直接放行（CI 必须能跑）
 *   · 非 TTY 且没有 --yes 时**放行**，因为 CI 里没人能回答提示，
 *     卡住比误操作更糟；此时日志里会留一行"已跳过确认"。
 */
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
