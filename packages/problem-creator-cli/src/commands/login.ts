import type { CommandContext } from '../core/context';
import { UsageError } from '../core/errors';
import { createAdminApi } from '../services/admin-api';
import {
   readCredentials,
   removeCredentials,
   writeCredentials,
} from '../services/credentials';
import { createDeviceFlow } from '../services/device-flow';
import { openBrowser } from '../utils/browser';
import { describeTokenExpiry } from '../utils/jwt';
import { promptHidden, promptVisible, readAllStdin } from '../utils/terminal';
import type { CommandRegistry } from './registry';
import { summarizeUser } from './support';

export interface LoginOptions {
   email?: string;
   passwordStdin?: boolean;
   logout?: boolean;
   show?: boolean;
   /** 用设备码流程登录（RFC 8628），不需要输入密码 */
   device?: boolean;
   /** 只打印验证地址与验证码，不自动打开浏览器 */
   noBrowser?: boolean;
}

export const registerLoginCommand = (registry: CommandRegistry): void => {
   const { program, context } = registry;

   program
      .command('login')
      .description(
         '登录并保存会话凭据（默认 ~/.config/quanta/credentials.json）',
      )
      .option(
         '--email <email>',
         '账号邮箱（显式走密码登录；也可用 QUANTA_EMAIL）',
      )
      .option(
         '--password-stdin',
         '从标准输入读取密码（显式走密码登录，推荐用于 CI）',
      )
      .option('--show', '只显示当前登录状态，不做登录')
      .option('--logout', '删除本地凭据')
      .option('--device', '用设备码在浏览器里授权登录（默认行为）')
      .option(
         '--no-browser',
         '设备码流程下只打印地址与验证码，不自动打开浏览器',
      )
      .action(async (options: LoginOptions) => {
         const ctx = await context();
         await runLogin(ctx, options);
      });
};

/**
 * 密码登录是**显式**选项：默认走设备码。
 *
 * 只有给了 `--email` / `--password-stdin` 才认为用户要密码流程；
 * 环境变量（QUANTA_EMAIL / QUANTA_PASSWORD）只是这些参数的值来源，
 * 不单独切换流程——否则 CI 里残留的环境变量会意外改变本地交互行为。
 */
const wantsPasswordFlow = (options: LoginOptions): boolean =>
   Boolean(options.email || options.passwordStdin);

export const runLogin = async (
   ctx: CommandContext,
   options: LoginOptions,
): Promise<void> => {
   if (options.logout) {
      const removed = await removeCredentials(ctx.credentialsFile);
      ctx.logger.info(
         removed
            ? `已删除凭据：${ctx.credentialsFile}`
            : `本地没有凭据：${ctx.credentialsFile}`,
      );
      if (ctx.logger.json) ctx.logger.result({ loggedOut: true, removed });
      return;
   }

   if (options.show) {
      // 直接读文件而不是用 ctx：--show 需要展示"文件里到底存了什么"，
      // 而 ctx 已经被环境变量覆盖过（QUANTA_TOKEN 等）。
      const stored = await readCredentials(ctx.credentialsFile);
      const api = createAdminApi(ctx.client);
      let user = stored.user;
      if (ctx.client.hasSession) {
         user = await api.getCurrentUser().catch(() => stored.user);
      }
      ctx.logger.table([
         ['凭据文件', ctx.credentialsFile],
         ['API', ctx.client.baseUrl],
         ['用户', user ? summarizeUser(user) : '<未登录>'],
         ['access token', describeTokenExpiry(stored.cookies.access)],
         ['refresh token', stored.cookies.refresh ? '已保存' : '无'],
         [
            'csrf token',
            stored.cookies.csrf ? '已保存' : '无（将使用 x-ssr 通道）',
         ],
      ]);
      if (ctx.logger.json) {
         ctx.logger.result({
            credentialsFile: ctx.credentialsFile,
            apiUrl: ctx.client.baseUrl,
            user: user ?? null,
            hasSession: ctx.client.hasSession,
         });
      }
      return;
   }

   // 默认设备码：--device 显式指定，或没给任何密码登录参数时都走它
   if (options.device || !wantsPasswordFlow(options)) {
      await runDeviceLogin(ctx, options);
      return;
   }

   const email =
      options.email?.trim() ||
      ctx.runtime.env.QUANTA_EMAIL?.trim() ||
      (await promptVisible('邮箱：', {
         stdin: ctx.runtime.stdin,
         stderr: ctx.runtime.stderr,
      }));
   if (!email)
      throw new UsageError('缺少邮箱：用 --email 或 QUANTA_EMAIL 提供');

   const password = await resolvePassword(ctx, options);

   const api = createAdminApi(ctx.client);
   ctx.logger.step(`登录 ${ctx.client.baseUrl}`);
   const result = await api.login({ email, password });

   // 服务端同时下发 cookie（客户端已自动吸收）与 csrfToken 字段；
   // 两者取其一即可，这里把 body 里的值作为兜底，避免 set-cookie 被代理吞掉时无法鉴权。
   if (result.csrfToken && !ctx.client.cookies.csrf) {
      ctx.client.cookies.csrf = result.csrfToken;
   }

   await writeCredentials(ctx.credentialsFile, {
      version: 1,
      apiUrl: ctx.env.apiUrl,
      cookies: { ...ctx.client.cookies },
      user: result.user,
   });

   ctx.logger.success(`已登录：${summarizeUser(result.user)}`);
   ctx.logger.detail(`凭据已写入 ${ctx.credentialsFile}（权限 0600）`);
   if (result.user.role !== 'ADMIN' && result.user.role !== 'SUPER_ADMIN') {
      ctx.logger.warn(`当前角色是 ${result.user.role}，出题接口要求 ADMIN`);
   }

   if (ctx.logger.json) {
      ctx.logger.result({
         credentialsFile: ctx.credentialsFile,
         apiUrl: ctx.env.apiUrl,
         user: result.user,
      });
   }
};

/**
 * 设备码登录（RFC 8628）—— `qpc login` 的默认流程。
 *
 * 流程：申请验证码 → 浏览器授权 → 轮询换 token → 写入凭据文件。
 * 相比邮箱密码登录：
 *   · 密码不经过 CLI（由浏览器在正规登录页处理）；
 *   · 可以复用浏览器里已有的登录态；
 *   · 在远程/无 GUI 环境下仍然可用（--no-browser 后到别的设备手动打开）。
 */
const runDeviceLogin = async (
   ctx: CommandContext,
   options: LoginOptions,
): Promise<void> => {
   const flow = createDeviceFlow({
      baseUrl: ctx.env.apiUrl,
      fetch: ctx.runtime.fetch as typeof globalThis.fetch,
      logger: ctx.logger,
      ...(ctx.runtime.signal ? { signal: ctx.runtime.signal } : {}),
      timeoutMs: ctx.env.timeoutMs,
   });

   ctx.logger.step(`向 ${ctx.env.apiUrl} 申请设备授权码`);
   const auth = await flow.requestCodes();

   // RFC §3.3：必须同时展示 verification_uri 与 user_code。
   // verification_uri_complete 只是便利（预填码），不能替代这两项 ——
   // 用户需要用验证码核对"待授权的设备就是眼前这台"（也是 RFC §5.4 的防钓鱼要求）。
   ctx.logger.blank();
   ctx.logger.info('请在浏览器中完成授权：');
   ctx.logger.info(`  地址：${auth.verification_uri}`);
   ctx.logger.info(`  验证码：${ctx.logger.colors.bold(auth.user_code)}`);
   ctx.logger.detail(
      `验证码 ${Math.round(auth.expires_in / 60)} 分钟内有效，请在确认页核对与本终端一致`,
   );
   ctx.logger.blank();

   if (!options.noBrowser) {
      const target = auth.verification_uri_complete || auth.verification_uri;
      const opened = await openBrowser(target);
      ctx.logger.detail(
         opened
            ? '已尝试在浏览器中打开授权页面'
            : '无法自动打开浏览器，请手动访问上面的地址',
      );
   }

   ctx.logger.step('等待授权完成（Ctrl-C 取消）');

   const tokens = await flow.pollForToken(auth, (elapsedMs) => {
      if (ctx.logger.level === 'debug') {
         ctx.logger.detail(
            `仍在等待授权… 已等待 ${Math.round(elapsedMs / 1000)} 秒`,
         );
      }
   });

   ctx.client.cookies.access = tokens.access_token;
   ctx.client.cookies.refresh = tokens.refresh_token;

   await writeCredentials(ctx.credentialsFile, {
      version: 1,
      apiUrl: ctx.env.apiUrl,
      cookies: { ...ctx.client.cookies },
   });

   // 立刻用拿到的 token 查一次用户信息：
   // token 到底能不能用、角色是不是 ADMIN，现在就能告诉用户，
   // 而不是等他跑 upload 时才失败。
   const api = createAdminApi(ctx.client);
   let summary = '已登录';
   try {
      const user = await api.getCurrentUser();
      summary = `已登录：${summarizeUser(user)}`;
      await writeCredentials(ctx.credentialsFile, {
         version: 1,
         apiUrl: ctx.env.apiUrl,
         cookies: { ...ctx.client.cookies },
         user,
      });
      if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
         ctx.logger.warn(
            `当前角色是 ${user.role}，出题接口要求 ADMIN，upload/publish 会被拒绝`,
         );
      }
   } catch (error) {
      // 凭据已经落盘成功，取用户信息失败不该让整个登录失败
      ctx.logger.warn(
         `登录成功但读取用户信息失败：${error instanceof Error ? error.message : String(error)}`,
      );
   }

   ctx.logger.success(summary);
   ctx.logger.detail(`凭据已写入 ${ctx.credentialsFile}（权限 0600）`);

   if (ctx.logger.json) {
      ctx.logger.result({
         loginMethod: 'device_code',
         credentialsFile: ctx.credentialsFile,
         apiUrl: ctx.env.apiUrl,
         scope: tokens.scope,
      });
   }
};

const resolvePassword = async (
   ctx: CommandContext,
   options: LoginOptions,
): Promise<string> => {
   const fromEnv = ctx.runtime.env.QUANTA_PASSWORD;
   if (fromEnv) return fromEnv;

   if (options.passwordStdin) {
      const value = await readAllStdin(ctx.runtime.stdin);
      if (!value) throw new UsageError('--password-stdin 没有读到内容');
      return value;
   }

   if (!ctx.runtime.stdin.isTTY) {
      throw new UsageError('非交互环境下无法提示输入密码', {
         hint: '用 `echo "$PASSWORD" | qpc login --password-stdin`，或设置 QUANTA_PASSWORD。',
      });
   }

   const value = await promptHidden('密码（不会回显）：', {
      stdin: ctx.runtime.stdin,
      stderr: ctx.runtime.stderr,
   });
   if (!value) throw new UsageError('密码为空');
   return value;
};
