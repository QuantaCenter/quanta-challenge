const REQUIRED_SECRETS = [
   { env: 'ACCESS_TOKEN_SECRET', config: 'accessToken' },
   { env: 'REFRESH_TOKEN_SECRET', config: 'refreshToken' },
] as const;

const CLOUD_FUNCTION_SECRET = 'CF_INTERNAL_SECRET';

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

   console.warn(`${message}（开发环境放行）`);

   const cfSecret = (useRuntimeConfig().cloudFunction as { secret?: string })
      .secret;
   if (!process.env[CLOUD_FUNCTION_SECRET] && !cfSecret) {
      console.warn(
         `[配置警告] 未设置 ${CLOUD_FUNCTION_SECRET}。站点调用云函数时将失败；` +
            '如需使用云函数系统，请配置与 challenge-cloud-function 一致的内部密钥。',
      );
   }
});
