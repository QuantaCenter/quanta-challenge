import * as Sentry from '@sentry/nuxt'

/** 浏览器端监控初始化：事件全部走同源 tunnel 转发到 observation，不直连 Sentry SaaS；DSN 的 publicKey 即 app 标识。运行时覆盖用 NUXT_PUBLIC_SENTRY_*。 */
const { dsn, tunnel, release, environment, sampleRate, tracesSampleRate } = useRuntimeConfig().public.sentry;

if (dsn) {
   Sentry.init({
      dsn,
      tunnel: tunnel || undefined,
      release: release || undefined,
      environment: environment || undefined,
      // 错误事件采样率
      sampleRate,
      // 性能事务采样率（默认 10%，生产可按流量调低）
      tracesSampleRate,
   });
}
