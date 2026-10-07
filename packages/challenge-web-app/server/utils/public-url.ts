import type { H3Event } from 'h3';

/**
 * 解析站点对外的 base URL，用于拼 verification_uri。
 *
 * 不能直接用 runtimeConfig.public.appBaseUrl：那是**构建期**读到的值，
 * 自建部署里常常是 docker-compose 的默认值或 localhost，用户拿到的
 * verification_uri 会是 http://localhost:3000 这种在本机之外打不开的地址。
 * 这里优先用请求本身的 Host / x-forwarded-* 头，让地址与实际访问方式一致
 * （与 server/trpc/routes/auth/authn.ts 里 resolveWebAuthnContext 的做法同源）。
 */
export const resolvePublicBaseUrl = (event: H3Event): string => {
   const forwardedHost = getHeader(event, 'x-forwarded-host');
   const forwardedProto = getHeader(event, 'x-forwarded-proto');
   const host = forwardedHost || getHeader(event, 'host');

   if (host) {
      const proto = forwardedProto || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
      return `${proto}://${host}`;
   }

   // 兜底：Host 头缺失（本地直连、非常规代理）时退回配置值
   const configured = String(useRuntimeConfig().public?.appBaseUrl ?? 'http://localhost:3000');
   return configured.replace(/\/+$/, '');
};
