import prisma from '~~/lib/prisma';
import type { H3Event } from 'h3';
import { setCookie, getCookie } from 'h3';
import { useRedis } from '../../utils/redis';
import { decrypt, encrypt, opaque, digest, equal } from './core';
import { api, githubError } from './client';

export const settings = () => {
   const config = useRuntimeConfig();
   const github = config.github;
   // Read legacy/simple GITHUB_* names at runtime; secrets are never baked into nuxt.config.
   const clientId = String(github.clientId || process.env.GITHUB_CLIENT_ID || '');
   const clientSecret = String(github.clientSecret || process.env.GITHUB_CLIENT_SECRET || '');
   const slug = String(github.appSlug || process.env.GITHUB_APP_SLUG || '');
   const webhookSecret = String(github.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET || '');
   const origin = String(github.origin || process.env.GITHUB_ORIGIN || config.public.appBaseUrl).replace(/\/$/, '');
   const key = Buffer.from(String(github.tokenKey || process.env.GITHUB_TOKEN_KEY || ''), 'base64');
   const enabled = !!clientId && !!clientSecret && !!slug && key.length === 32;
   return { clientId, clientSecret, slug, webhookSecret, origin, key, enabled };
};
export const requireSettings = () => {
   const config = settings();
   if (!config.enabled) throw githubError('GitHub 连接尚未配置，请联系管理员');
   const url = new URL(config.origin);
   if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw githubError('GitHub 回调配置必须是站点 origin，不能包含路径或参数');
   if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw githubError('GitHub 回调地址必须使用 HTTPS');
   return config;
};
export const returnPath = (target: string) => target === 'settings' ? '/app/settings/security' : '/app/workshop?githubImport=1';
const COOKIE = 'quanta_github_browser';

export async function begin(event: H3Event, userId: string, target: 'workshop' | 'settings', install = false) {
   const config = requireSettings();
   const key = `github:authorize-limit:${userId}:${Math.floor(Date.now() / 60000)}`;
   const attempts = await useRedis().incr(key);
   if (attempts === 1) await useRedis().expire(key, 120);
   if (attempts > 10) throw githubError('授权操作过于频繁，请稍后重试', 'TOO_MANY_REQUESTS');
   const state = opaque(), verifier = opaque();
   const previousBrowser = getCookie(event, COOKIE);
   const browser = previousBrowser && /^[\w-]{43}$/.test(previousBrowser) ? previousBrowser : opaque();
   setCookie(event, COOKIE, browser, { httpOnly: true, secure: new URL(config.origin).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 600 });
   await useRedis().set(`github:state:${digest(state)}`, JSON.stringify({ userId, target, browser: digest(browser), verifier, install }), 'EX', 600);
   const url = new URL(install ? `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new` : 'https://github.com/login/oauth/authorize');
   url.searchParams.set('state', state);
   if (!install) {
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', `${config.origin}/api/auth/github/callback`);
      url.searchParams.set('code_challenge', digest(verifier));
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('scope', 'offline_access');
   }
   return { url: url.toString() };
}

export async function consumeState(event: H3Event, state: unknown, userId: string, install: boolean) {
   if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state)) throw githubError('授权会话已过期，请重新连接');
   const value = await useRedis().getdel(`github:state:${digest(state)}`);
   if (!value) throw githubError('授权会话已过期，请重新连接');
   const pending = JSON.parse(value) as { userId: string; browser: string; verifier: string; target: 'workshop' | 'settings'; install: boolean };
   if (pending.userId !== userId || pending.install !== install || !equal(pending.browser, digest(getCookie(event, COOKIE) || ''))) throw githubError('授权会话不匹配，请重新连接');
   return pending;
}

type Tokens = { access_token: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };
class RejectedGrant extends Error {}
export async function exchange(values: Record<string, string>): Promise<Tokens> {
   const config = requireSettings();
   const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }),
      redirect: 'error', signal: AbortSignal.timeout(15000),
   });
   if (!response.ok) throw githubError('GitHub 授权失败，请重新连接');
   const tokens = await response.json() as Tokens & { error?: string };
   if (['bad_refresh_token', 'invalid_grant', 'expired_token'].includes(tokens.error ?? '')) throw new RejectedGrant('GitHub 授权已失效');
   if (!tokens.access_token) throw githubError('GitHub 授权失败，请重新连接');
   return tokens;
}
const credentials = (tokens: Tokens, userId: string) => ({
   accessTokenEncrypted: encrypt(tokens.access_token, requireSettings().key, userId),
   accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
   refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token, requireSettings().key, userId) : null,
   refreshTokenExpiresAt: tokens.refresh_token_expires_in ? new Date(Date.now() + tokens.refresh_token_expires_in * 1000) : null,
   credentialKeyVersion: 1, revokedAt: null,
});

export async function bind(userId: string, tokens: Tokens) {
   const account = await api<{ id: number; login: string; avatar_url: string }>( '/user', tokens.access_token);
   await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`github:${userId}`}, 0))`;
      const existing = await tx.gitHubConnection.findUnique({ where: { userId } });
      if (existing && existing.githubUserId !== BigInt(account.id)) throw githubError('请先解绑当前 GitHub 账号，再绑定其他账号');
      const other = await tx.gitHubConnection.findUnique({ where: { githubUserId: BigInt(account.id) } });
      if (other && other.userId !== userId) throw githubError('该 GitHub 账号已绑定其他 Challenge 用户');
      const data = { githubUserId: BigInt(account.id), login: account.login, avatarUrl: account.avatar_url, ...credentials(tokens, userId) };
      await tx.gitHubConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
   });
}

export const revokedCredentials = () => ({ accessTokenEncrypted: null, refreshTokenEncrypted: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, revokedAt: new Date() });

export async function userToken(userId: string, optional = false): Promise<string | undefined> {
   const outcome = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`github:${userId}`}, 0))`;
      const row = await tx.gitHubConnection.findUnique({ where: { userId } });
      if (!row?.accessTokenEncrypted || row.revokedAt) return null;
      if (!row.accessTokenExpiresAt || row.accessTokenExpiresAt.getTime() > Date.now() + 60000) return decrypt(row.accessTokenEncrypted, requireSettings().key, userId);
      if (!row.refreshTokenEncrypted || (row.refreshTokenExpiresAt && row.refreshTokenExpiresAt.getTime() <= Date.now())) {
         await tx.gitHubConnection.update({ where: { userId }, data: revokedCredentials() });
         return null;
      }
      // Lock spans token rotation; do not discard valid credentials on transient network errors.
      let tokens: Tokens;
      try { tokens = await exchange({ grant_type: 'refresh_token', refresh_token: decrypt(row.refreshTokenEncrypted, requireSettings().key, userId) }); }
      catch (error) {
         if (!(error instanceof RejectedGrant)) throw error;
         await tx.gitHubConnection.update({ where: { userId }, data: revokedCredentials() });
         return null;
      }
      await tx.gitHubConnection.update({ where: { userId }, data: credentials(tokens, userId) });
      return tokens.access_token;
   }, { timeout: 25000 });
   if (!outcome && !optional) throw githubError('请先连接 GitHub 或重新授权', 'UNAUTHORIZED');
   return outcome ?? undefined;
}

export async function disconnect(userId: string) {
   await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`github:${userId}`}, 0))`;
      await tx.gitHubConnection.deleteMany({ where: { userId } });
   });
   return { success: true };
}
