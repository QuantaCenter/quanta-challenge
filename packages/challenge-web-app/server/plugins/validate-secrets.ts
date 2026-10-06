/**
 * 启动期密钥校验：生产环境缺失密钥时直接拒绝启动。
 *
 * ## 为什么校验在运行时，而不是在 nuxt.config 的构建期
 *
 * nuxt.config.ts 的 envSecret() 原先在 NODE_ENV=production 时抛错，而 `nuxi prepare` /
 * `nuxt build` 会被 Nuxt CLI 置为 production，于是**任何**镜像构建都会在
 * `Dockerfile:62 RUN pnpm exec nuxi prepare` 处失败：
 *   ERROR [配置错误] 生产环境必须设置 ACCESS_TOKEN_SECRET。
 * 而构建机不该持有运行时密钥——唯一绕过的办法是把密钥通过 --build-arg 送进构建环境，
 * 再被 runtimeConfig 烤进镜像层（`docker save` 即可提取），这与其「避免密钥静默降级」
 * 的初衷正好相反。所以构建期放行、启动期校验：镜像里不含密钥，漏配则在容器启动的
 * 第一时间暴露，而不是留到线上出现「谁都能伪造登录态」。
 *
 * ## 判定来源
 *
 * process.env 与 runtimeConfig 任一非空即视为已配置：
 * - process.env 是容器运行时注入的真实值（compose 的 environment）；
 * - runtimeConfig 里可能是构建期烤进去的值（生产构建通常为空串），
 *   或开发环境的 `dev_only_*` 兜底值。
 */
const REQUIRED_SECRETS = [
   { env: 'ACCESS_TOKEN_SECRET', config: 'accessToken' },
   { env: 'REFRESH_TOKEN_SECRET', config: 'refreshToken' },
] as const;

export default defineNitroPlugin(() => {
   const secret = useRuntimeConfig().secret as Record<string, string | undefined>;

   const missing = REQUIRED_SECRETS.filter(
      ({ env, config }) => !process.env[env] && !secret[config],
   ).map(({ env }) => env);

   if (missing.length === 0) return;

   const message =
      `[配置错误] 缺少 ${missing.join(' / ')}。` +
      '该密钥用于签发登录凭证，缺失时任何人都能伪造任意用户的登录态。';

   if (process.env.NODE_ENV === 'production') {
      throw new Error(`${message}生产环境拒绝以空密钥启动。`);
   }

   // 开发环境不阻断：nuxt.config 会回落到 dev_only_* 兜底值，保证 pnpm dev 开箱可用
   console.warn(`${message}（开发环境放行）`);
});
