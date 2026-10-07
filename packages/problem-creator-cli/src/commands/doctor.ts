import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandContext } from '../core/context';
import { ApiError, CliError } from '../core/errors';
import { DEFAULT_CONFIG_FILES } from '../domain/problem-config';
import { describeTokenExpiry } from '../utils/jwt';
import type { CommandRegistry } from './registry';
import { summarizeUser } from './support';

type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

interface CheckResult {
   name: string;
   status: CheckStatus;
   detail: string;
   /** 失败时的修复建议 */
   fix?: string;
}

const MIN_NODE_MAJOR = 20;

export const registerDoctorCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('doctor')
      .description('自检：运行环境、API 可达性、登录状态')
      .action(async () => {
         const ctx = await context();
         await runDoctor(ctx);
      });
};

export const runDoctor = async (ctx: CommandContext): Promise<void> => {
   const results: CheckResult[] = [];

   results.push(checkNodeVersion());

   const credentials = await checkCredentialsFile(ctx);
   results.push(credentials);

   results.push(await checkApiReachable(ctx));
   results.push(await checkSession(ctx));

   const configFile = DEFAULT_CONFIG_FILES.map((name) =>
      existsSync(join(ctx.cwd, name)),
   ).some(Boolean);
   results.push({
      name: '当前目录的题目配置',
      status: configFile ? 'ok' : 'skip',
      detail: configFile
         ? '找到 problem.config.*'
         : `在 ${ctx.cwd} 未找到（用 --cwd 指定题目目录）`,
   });

   ctx.logger.step('qpc doctor');
   const symbols: Record<CheckStatus, string> = {
      ok: ctx.logger.colors.green('✔'),
      warn: ctx.logger.colors.yellow('▲'),
      fail: ctx.logger.colors.red('✖'),
      skip: ctx.logger.colors.dim('–'),
   };
   for (const result of results) {
      ctx.logger.info(
         `  ${symbols[result.status]} ${result.name}：${result.detail}`,
      );
      if (result.fix && result.status !== 'ok')
         ctx.logger.detail(`修复：${result.fix}`);
   }

   const failures = results.filter((result) => result.status === 'fail');
   if (ctx.logger.json) {
      ctx.logger.result({
         ok: failures.length === 0,
         checks: results,
         apiUrl: ctx.env.apiUrl,
         credentialsFile: ctx.credentialsFile,
      });
   }

   if (failures.length > 0) {
      throw new CliError(`${failures.length} 项检查失败`, {
         hint: '按上面的"修复"逐项处理；只关心题目本身时可以先跑 `qpc check`。',
      });
   }
   ctx.logger.success('全部检查通过');
};

const checkNodeVersion = (): CheckResult => {
   const major = Number.parseInt(
      process.versions.node.split('.')[0] ?? '0',
      10,
   );
   return {
      name: 'Node 版本',
      status: major >= MIN_NODE_MAJOR ? 'ok' : 'fail',
      detail: `v${process.versions.node}`,
      fix: `升级到 Node ${MIN_NODE_MAJOR} 及以上`,
   };
};

const checkCredentialsFile = async (
   ctx: CommandContext,
): Promise<CheckResult> => {
   if (!existsSync(ctx.credentialsFile)) {
      return {
         name: '凭据文件',
         status: ctx.client.hasSession ? 'ok' : 'warn',
         detail: ctx.client.hasSession
            ? '不存在，但已通过环境变量提供令牌'
            : `不存在：${ctx.credentialsFile}`,
         fix: 'qpc login',
      };
   }
   const info = await stat(ctx.credentialsFile).catch(() => undefined);
   if (!info) {
      return {
         name: '凭据文件',
         status: 'warn',
         detail: `无法读取：${ctx.credentialsFile}`,
         fix: 'qpc login',
      };
   }
   const mode = (info.mode & 0o777).toString(8);
   // 令牌文件对同机其它用户可读是真实的安全问题，值得报 warn
   const tooOpen = (info.mode & 0o077) !== 0;
   return {
      name: '凭据文件',
      status: tooOpen ? 'warn' : 'ok',
      detail: `${ctx.credentialsFile}（权限 ${mode}）`,
      fix: tooOpen ? `chmod 600 ${ctx.credentialsFile}` : undefined,
   };
};

const checkApiReachable = async (ctx: CommandContext): Promise<CheckResult> => {
   try {
      // getUser 是受保护接口：未登录会返回 401，正好用来证明"服务活着且有 tRPC 路由"。
      await ctx.client.call('auth.login.getUser', { method: 'GET' });
      return {
         name: 'API 可达',
         status: 'ok',
         detail: `${ctx.env.apiUrl}（已登录）`,
      };
   } catch (error) {
      if (
         error instanceof ApiError &&
         (error.status === 401 || error.status === 403)
      ) {
         return {
            name: 'API 可达',
            status: 'ok',
            detail: `${ctx.env.apiUrl}（未登录/无权限，但服务正常）`,
         };
      }
      return {
         name: 'API 可达',
         status: 'fail',
         detail: error instanceof Error ? error.message : String(error),
         fix: '确认 Web 应用已启动（docker compose up -d），或用 --api 指定地址',
      };
   }
};

const checkSession = async (ctx: CommandContext): Promise<CheckResult> => {
   if (!ctx.client.hasSession) {
      return {
         name: '登录状态',
         status: 'warn',
         detail: '未登录',
         fix: `qpc login --api ${ctx.env.apiUrl}`,
      };
   }
   try {
      const user = await ctx.client.call<{ user: Record<string, string> }>(
         'auth.login.getUser',
         { method: 'GET' },
      );
      const role = user.user.role;
      const admin = role === 'ADMIN' || role === 'SUPER_ADMIN';
      return {
         name: '登录状态',
         status: admin ? 'ok' : 'warn',
         detail: `${summarizeUser(user.user)}；access token ${describeTokenExpiry(ctx.credentials.cookies.access)}`,
         fix: admin ? undefined : '出题接口要求 ADMIN 角色，请用管理员账号登录',
      };
   } catch (error) {
      return {
         name: '登录状态',
         status: 'fail',
         detail: error instanceof Error ? error.message : String(error),
         fix: 'qpc login（凭据可能已过期或被服务端密钥轮换失效）',
      };
   }
};
