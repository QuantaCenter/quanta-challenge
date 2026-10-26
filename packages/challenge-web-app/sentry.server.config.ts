import * as Sentry from '@sentry/nuxt';

/** 服务端（Nitro SSR）监控初始化：useRuntimeConfig 就绪前加载，只能读 process.env；DSN 直指 observation 的 Envelope 端点，未配置时静默跳过。 */
const dsn = process.env.SENTRY_DSN || '';

if (dsn) {
   Sentry.init({
      dsn,
      transportOptions: {
         headers: process.env.OBSERVATION_REPORT_TOKEN
            ? { 'x-obs-token': process.env.OBSERVATION_REPORT_TOKEN }
            : undefined,
      },
      release: process.env.RELEASE_VERSION || undefined,
      environment: process.env.SENTRY_ENVIRONMENT || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      // 只静默登录流程的高频性能事务；错误事件照常上报，保证登录故障可观测。
      ignoreTransactions: [
         /\/api\/auth\/quanta/,
         /\/api\/trpc\/auth\.quanta\./,
         /\/auth\/quanta/,
      ],
   });
}
