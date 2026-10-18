import * as Sentry from '@sentry/nuxt'

/** 服务端（Nitro SSR）监控初始化：useRuntimeConfig 就绪前加载，只能读 process.env；DSN 直指 observation 的 Envelope 端点，未配置时静默跳过。 */
const dsn = process.env.SENTRY_DSN || '';

if (dsn) {
   Sentry.init({
      dsn,
      release: process.env.RELEASE_VERSION || undefined,
      environment: process.env.SENTRY_ENVIRONMENT || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      ignoreTransactions: [/\/api\/auth\/quanta/, /\/auth\/quanta/],
      beforeSend(event) {
         return /\/api\/auth\/quanta|\/auth\/quanta/.test(event.request?.url || '') ? null : event;
      },
      beforeBreadcrumb(crumb) {
         return /\/api\/auth\/quanta|\/auth\/quanta/.test(String(crumb.data?.url || '')) ? null : crumb;
      },
   });
}
