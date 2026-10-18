import type { H3Event } from 'h3';

/** 解析站点对外的 base URL：优先用请求的 Host / x-forwarded-* 头（构建期读到的 appBaseUrl 常是 compose 默认值，在本机之外打不开）。 */
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
