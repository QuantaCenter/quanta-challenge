import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const devCertPath = fileURLToPath(
   new URL('./.dev-certs/cert.pem', import.meta.url),
);
const devKeyPath = fileURLToPath(
   new URL('./.dev-certs/key.pem', import.meta.url),
);
const devServerHttps =
   existsSync(devCertPath) && existsSync(devKeyPath)
      ? { cert: devCertPath, key: devKeyPath }
      : undefined;

const env = (key: string, fallback: string) => process.env[key] || fallback;
const envInt = (key: string, fallback: number) =>
   process.env[key] ? parseInt(process.env[key] as string) : fallback;

const imageBuildMaxCompressedBytes = envInt(
   'IMAGE_BUILD_MAX_COMPRESSED_BYTES',
   160 * 1024 * 1024,
);

const problemUploadMaxRequestBytes = envInt(
   'PROBLEM_UPLOAD_MAX_REQUEST_BYTES',
   160 * 1024 * 1024,
);

/**
 * 工坊单文件上限。项目文件资产统一走 file-assets 服务，那里的单文件上限同为 20MB，
 * 调大此值时需同步调整 server/trpc/services/file-assets.ts。
 */
const workshopMaxFileBytes = envInt('WORKSHOP_MAX_FILE_BYTES', 20 * 1024 * 1024);

const envSecret = (key: string) => {
   const value = process.env[key];
   if (value) return value;

   if (process.env.NODE_ENV === 'production') return '';

   return `dev_only_${key}`;
};

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
   compatibilityDate: '2025-07-15',

   devServer: devServerHttps ? { https: devServerHttps } : {},

   devtools: { enabled: false },

   experimental: {
      asyncContext: true,
   },

   css: ['~/assets/css/tailwind.css'],
   vite: {
      // biome-ignore lint/suspicious/noExplicitAny: Existing Tailwind/Nuxt Vite versions expose incompatible plugin types.
      plugins: [tailwindcss() as any],
      ssr: {
         noExternal: ['winston'],
      },
      worker: {
         format: 'es',
      },
      optimizeDeps: {
         include: [
            'monaco-editor',
            'monaco-editor/esm/vs/editor/editor.worker',
            'monaco-editor/esm/vs/language/typescript/ts.worker',
            'monaco-editor/esm/vs/language/json/json.worker',
            'monaco-editor/esm/vs/language/css/css.worker',
            'monaco-editor/esm/vs/language/html/html.worker',
            '@volar/monaco',
            '@volar/monaco/worker',
            '@volar/jsdelivr',
            '@vue/language-service',
            'vscode-uri',
            'vscode-html-languageservice',
            'typescript',
            '@webcontainer/api',
            'xterm',
            'xterm-addon-fit',
            'marked',
            'minimatch',
            'color',
            'shiki',
            '@shikijs/monaco',
            'dayjs',
            'dayjs/plugin/duration',
            'dayjs/plugin/relativeTime',
            'dayjs/plugin/utc',
            'dayjs/plugin/timezone',
            'dayjs/locale/zh-cn',
            '@trpc/client',
            '@trpc/server',
            '@icon-park/vue-next',
            '@simplewebauthn/browser',
            'pino',
            'zod',
         ],
      },
      server: {
         headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*',
         },
         allowedHosts: ['host.docker.internal'],
      },
      resolve: {
         alias: {
            path: 'path-browserify',
         },
      },
   },

   security: {
      sri: true,
      xssValidator: false,
      rateLimiter: false,

      corsHandler: false,

      nonce: false,
   },

   routeRules: {
      '/api/auth/quanta/**': {
         headers: {
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY',
         },
      },
      '/auth/quanta/**': {
         headers: {
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY',
         },
      },
      '/**': {
         security: {
            headers: {
               contentSecurityPolicy: {
                  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                  'upgrade-insecure-requests':
                     process.env.NODE_ENV === 'production',
               },
            },
         },
      },
      '/challenge/**': {
         headers: { 'Cache-Control': 'private, no-cache' },
         security: {
            headers: {
               crossOriginOpenerPolicy: 'same-origin',
               crossOriginEmbedderPolicy: 'require-corp',
            },
         },
      },
      // 工坊 IDE 同样运行在 WebContainer 中，需要跨源隔离
      '/workshop/**': {
         headers: { 'Cache-Control': 'private, no-cache' },
         security: {
            headers: {
               crossOriginOpenerPolicy: 'same-origin',
               crossOriginEmbedderPolicy: 'require-corp',
            },
         },
      },
      // 学习页的题目小节用 iframe 嵌入做题页：子页面的 WebContainer 要求父页面同样跨源隔离
      '/app/learning/study/**': {
         headers: { 'Cache-Control': 'private, no-cache' },
         security: {
            headers: {
               crossOriginOpenerPolicy: 'same-origin',
               crossOriginEmbedderPolicy: 'require-corp',
            },
         },
      },
      // 快照镜像构建页同样需要跨源隔离
      '/app/publish/image': {
         security: {
            headers: {
               crossOriginOpenerPolicy: 'same-origin',
               crossOriginEmbedderPolicy: 'require-corp',
            },
         },
      },
      '/app/publish/image/**': {
         security: {
            headers: {
               crossOriginOpenerPolicy: 'same-origin',
               crossOriginEmbedderPolicy: 'require-corp',
            },
         },
      },
      '/api/image-builds/upload': {
         security: {
            requestSizeLimiter: {
               maxRequestSizeInBytes: imageBuildMaxCompressedBytes,
            },
         },
      },
      // 工坊文件上传：请求体是原始文件字节，留出少量余量
      '/api/workshop/projects/**': {
         security: {
            requestSizeLimiter: {
               maxRequestSizeInBytes: workshopMaxFileBytes + 1024 * 1024,
               maxUploadFileRequestInBytes: workshopMaxFileBytes + 1024 * 1024,
            },
         },
      },
      '/api/trpc/admin.problem.upload': {
         security: {
            requestSizeLimiter: {
               maxRequestSizeInBytes: problemUploadMaxRequestBytes,
            },
         },
      },
      '/api/trpc/admin.problem.reupload': {
         security: {
            requestSizeLimiter: {
               maxRequestSizeInBytes: problemUploadMaxRequestBytes,
            },
         },
      },
      '/_nuxt/**': {
         headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Resource-Policy': 'cross-origin',
         },
         security: {
            headers: {
               crossOriginOpenerPolicy: 'same-origin',
               crossOriginEmbedderPolicy: 'require-corp',
               crossOriginResourcePolicy: 'cross-origin',
            },
         },
      },
      '/_nuxt/**/*.js': {
         security: {
            headers: {
               crossOriginResourcePolicy: 'cross-origin',
            },
         },
      },
   },

   app: {
      // 每次发布独立资源目录，防止相同 chunk 文件名命中上一版的强缓存。
      // 本地生产构建也生成独立版本；开发模式维持 Nuxt 默认路径。
      buildAssetsDir: process.env.NODE_ENV === 'production'
         ? `/_nuxt/${env('NUXT_ASSET_VERSION', randomUUID())}/`
         : '/_nuxt/',
      pageTransition: {
         name: 'page',
         mode: 'out-in',
      },
      head: {
         meta: [
            { name: 'referrer', content: 'origin-when-cross-origin' },
            { name: 'theme-color', content: '#111111' },
         ],
      },
   },

   hooks: {
      // 不输出 <link rel="prefetch">：HTTP/2 下浏览器会把几十个其他页面的 chunk 与首屏 modulepreload 同时发出，在出口带宽受限时直接挤占关键 JS 的带宽。路由跳转时 Vite 的 __vitePreload 仍会并行预加载目标页依赖。
      'build:manifest': (manifest) => {
         for (const key in manifest) {
            if (!manifest[key]) continue;
            manifest[key].prefetch = false;
         }
      },
   },

   modules: [
      '@pinia/nuxt',
      '@vueuse/nuxt',
      'nuxt-security',
      '@sentry/nuxt/module',
   ],

   nitro: {
      externals: {
         // dayjs 的 package.json 没有 exports 字段，只声明了 main。Nitro 默认把它 作为 external 原样留在产物里（.output/server/node_modules），而产物中的 裸导入 `dayjs/plugin/utc` 在 Node 24 ESM 下不会自动补 .js，启动即报 ERR_MODULE_NOT_FOUND 并退出。内联后由构建期解析，不再漏到运行时。 注意：matcher 是 id.startsWith('dayjs')，plugin/* 子路径会一并内联。
         inline: ['dayjs'],
         external: [
            '@prisma/client',
            '.prisma/client',
            'pino',
            'pino-pretty',
            'ioredis',
            'standard-as-callback',
         ],
      },
      devProxy: { host: '127.0.0.1' },
      preset: 'node-server',
      // 构建期生成 .br/.gz，静态处理器按 Accept-Encoding 直接返回，不再依赖反向代理逐请求实时压缩
      compressPublicAssets: { gzip: true, brotli: true },
      storage: {
         local: {
            driver: 'fs',
            base: './storage/local',
         },
      },
      // 工坊内置模板：模板文件以普通文件的形式放在 shared 包里，作为服务端资源打包，
      // 运行时经 useStorage('assets:workshop-templates') 读取并组装（见 server/services/builtin-workshop-templates.ts）。
      // 开发环境直接读取磁盘，改动模板文件后无需重启即可生效。
      serverAssets: [
         {
            baseName: 'workshop-templates',
            dir: fileURLToPath(
               new URL('../shared/service/workshop-templates/templates', import.meta.url),
            ),
            // 生产构建用 globby 扫描且默认跳过点文件（开发环境的 fs 驱动不会跳过），
            // 显式匹配点文件与点目录，保证 .gitignore、.vscode/ 这类模板文件两边一致
            pattern: '**/{*,.*,.*/**/*}',
            ignore: ['**/node_modules/**', '**/.DS_Store'],
         },
      ],
      experimental: {
         tasks: true,
      },
      scheduledTasks: {
         '0 0 * * *': 'db:update-rank-history',
      },
   },

   build: {
      transpile: ['trpc-nuxt', 'applicationinsights'],
   },

   runtimeConfig: {
      github: {
         // 按顺序尝试的归档镜像 URL 模板，JSON 数组；{url} 为 GitHub 归档地址。
         archiveMirrors: '',
         archiveTimeoutMs: 300000,
         clientId: '',
         clientSecret: '',
         appSlug: '',
         webhookSecret: '',
         tokenKey: '',
         origin: '',
      },
      public: {
         appBaseUrl: env('APP_SERVER', 'http://localhost:3000'),
         quantaOAuthIssuer: env(
            'QUANTA_OAUTH_ISSUER',
            'https://www.quantacenter.com',
         ),
         // 前端监控（@sentry/nuxt）：事件经 tunnel 同源代理进入 observation 服务， 不直连 Sentry SaaS。DSN 仅作事件元数据（publicKey = app 标识）。 初始化见根目录 sentry.client.config.ts
         sentry: {
            // publicKey 不能含连字符：@sentry/core 的 DSN_REGEX 对 publicKey 只认 \w，带 "-" 会让 DSN 解析失败、SDK 静默禁用（错误处理器也不安装）
            dsn: env('SENTRY_DSN', 'http://challenge_web_app@localhost:9310/1'),
            tunnel: env('SENTRY_TUNNEL', '/api/observation/sentry-tunnel'),
            release: env('RELEASE_VERSION', 'dev'),
            environment: env('SENTRY_ENVIRONMENT', ''),
            sampleRate: envInt('SENTRY_SAMPLE_RATE', 1),
            tracesSampleRate: Number(env('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
         },
         // 工坊项目配额（前后端共用：前端上传前预检、服务端校验）
         workshop: {
            maxFileBytes: workshopMaxFileBytes,
            maxProjectBytes: envInt('WORKSHOP_MAX_PROJECT_BYTES', 100 * 1024 * 1024),
            maxProjectsPerUser: envInt('WORKSHOP_MAX_PROJECTS_PER_USER', 20),
         },
         // 快照镜像体积上限（前后端共用：前端上传前预检、服务端与 routeRules 校验）
         imageBuild: {
            maxCompressedBytes: imageBuildMaxCompressedBytes,
            maxRawBytes: envInt(
               'IMAGE_BUILD_MAX_RAW_BYTES',
               1024 * 1024 * 1024,
            ),
         },
         // 云函数调用令牌 TTL（前后端共用：服务端写 Redis EX，前端算本地过期时间）
         cloudFunction: {
            tokenTTLSeconds: envInt(
               'CLOUD_FUNCTION_TOKEN_TTL_SECONDS',
               2 * 60 * 60,
            ),
         },
      },
      observation: {
         // observation 服务地址
         serverUrl: env('OBSERVATION_SERVER_URL', 'http://localhost:9310'),
      },
      secret: {
         // 这两个必须是显式配置的真实密钥，不能用内置默认值（见 envSecret 说明）
         accessToken: envSecret('ACCESS_TOKEN_SECRET'),
         refreshToken: envSecret('REFRESH_TOKEN_SECRET'),
         accessTokenExpiresIn: env('ACCESS_TOKEN_EXPIRES_IN', '15m'),
         refreshTokenExpiresIn: env('REFRESH_TOKEN_EXPIRES_IN', '7d'),
      },
      redis: {
         host: env('REDIS_HOST', 'localhost'),
         port: envInt('REDIS_PORT', 6379),
         username: env('REDIS_USERNAME', ''),
         password: env('REDIS_PASSWORD', ''),
      },
      judge: {
         serverUrl: env('JUDGE_SERVER', 'http://localhost:1888'),
      },
      llm: {
         // responsesUrl 默认指向 DeepSeek，兼容直接配置 DEEPSEEK_API_KEY 的本地环境；
         // 显式覆盖仍优先使用 NUXT_LLM_API_KEY
         apiKey: env('NUXT_LLM_API_KEY', env('DEEPSEEK_API_KEY', '')),
         responsesUrl: 'https://api.deepseek.com/responses',
         model: 'deepseek-flash',
      },
      quanta: {
         // 出题 CLI 的最低版本，配置值只能高于内置门槛。
         minCliVersion: env('QUANTA_MIN_CLI_VERSION', ''),
      },
      cloudFunction: {
         serverUrl: env('CF_SERVER', 'http://localhost:1890'),
         keyId: env('CF_INTERNAL_KEY_ID', 'web-app'),
         secret:
            process.env.CF_INTERNAL_SECRET ||
            (process.env.NODE_ENV === 'production'
               ? ''
               : 'dev_only_cloud_function_web_app'),
      },
      rank: {
         problemCacheTTL: envInt('PROBLEM_RANKING_CACHE_TTL', 3600),
         globalCacheTTL: envInt('GLOBAL_RANKING_CACHE_TTL', 60),
      },
      fileSync: {
         maxChangesPerSync: envInt('FILE_SYNC_MAX_CHANGES', 50),
      },
      openapi: {
         webhookSecret: env('OPENAPI_WEBHOOK_SECRET', ''),
      },
      email: {
         account: env('EMAIL_ACCOUNT', ''),
         smtpPassword: env('EMAIL_SMTP_PASSWORD', ''),
      },
      timer: {
         githubImportConcurrency: envInt('TIMER_GITHUB_IMPORT_CONCURRENCY', 2),
         qualityConcurrency: envInt('TIMER_QUALITY_CONCURRENCY', 3),
         concurrency: envInt('TIMER_CONCURRENCY', 3),
         // 定时器 Worker 轮询间隔与单次领取批量
         pollIntervalMs: envInt('TIMER_POLL_INTERVAL_MS', 5000),
         batchSize: envInt('TIMER_BATCH_SIZE', 20),
         // 失败重试退避基数与上限：第 n 次失败后延迟 min(n * retryBackoffMs, maxRetryBackoffMs) 重试
         retryBackoffMs: envInt('TIMER_RETRY_BACKOFF_MS', 30_000),
         maxRetryBackoffMs: envInt('TIMER_MAX_RETRY_BACKOFF_MS', 300_000),
      },
      password: {
         // bcrypt 盐轮数，影响登录/注册 CPU 成本
         saltRounds: envInt('PASSWORD_SALT_ROUNDS', 10),
      },
      thumbhash: {
         // thumbhash → data URL 的 L2 Redis 缓存时长（结果不可变，过期仅用于回收旧封面）与 L1 进程内 LRU 容量
         redisCacheTTLSeconds: envInt(
            'THUMBHASH_REDIS_CACHE_TTL_SECONDS',
            60 * 60 * 24 * 30,
         ),
         memoryCacheSize: envInt('THUMBHASH_MEMORY_CACHE_SIZE', 1000),
      },
      trackActive: {
         // 用户最近活跃时间写库节流间隔
         writeIntervalMs: envInt('TRACK_ACTIVE_WRITE_INTERVAL_MS', 5 * 60 * 1000),
      },
      webauthn: {
         // WebAuthn options 在 Redis 的有效期
         optionsTTLSeconds: envInt('WEB_AUTHN_OPTIONS_TTL_SECONDS', 300),
      },
      daily: {
         // 每日一题 / 签到的业务时区：显式钉死、不依赖容器 TZ
         timezone: env('DAILY_TIMEZONE', 'Asia/Shanghai'),
      },
   },
});
