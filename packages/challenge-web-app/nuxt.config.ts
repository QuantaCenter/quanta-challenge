import tailwindcss from '@tailwindcss/vite';

/** 统一的运行时环境变量读取：import.meta.env 会被构建期静态替换、runtimeConfig 又强制 NUXT_ 前缀，故显式读 process.env 并显式声明 runtimeEnvKey。 */
const env = (key: string, fallback: string) => process.env[key] || fallback;
const envInt = (key: string, fallback: number) =>
   process.env[key] ? parseInt(process.env[key] as string) : fallback;

/** 读取必须显式提供的密钥：生产期一律返回空串、不静默降级，校验挪到启动时（validate-secrets.ts）——构建期抛错会拦死所有镜像构建且密钥不该进镜像；开发保留兜底值。 */
const envSecret = (key: string) => {
   const value = process.env[key];
   if (value) return value;

   if (process.env.NODE_ENV === 'production') return '';

   return `dev_only_${key}`;
};

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
   compatibilityDate: '2025-07-15',

   // 关闭 DevTools 面板。 原因：/challenge/** 为了 WebContainer 必须下发 COOP/COEP（跨源隔离）， 而 DevTools 是通过 iframe 注入的，在跨源隔离下会被浏览器拦截，控制台持续报 "Blocked a frame with origin http://localhost:3000 from accessing a cross-origin frame" 既污染日志，也可能触发额外的重载/重挂载——而重挂载正是编辑器侧 WebContainer 被误 teardown 的诱因之一。
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
         // 这里刻意 **不再** 排除 monaco-editor。 原先 exclude: ['monaco-editor'] 会让 Vite 不预打包 Monaco，改为按需处理 海量 ESM 文件，于是编辑器相关依赖会在**运行中**被逐个发现并触发 "new dependencies optimized → optimized dependencies changed. reloading"。 每次重载都会让浏览器整页刷新、切断 HMR WebSocket，进而抛出 read ECONNRESET / write ECONNABORTED；Nitro 的 unhandledRejection 报告器 随后终止 dev server——这就是"一打开做题页服务就崩"的完整因果链。 因此把编辑器与答题页会用到、且历史上反复触发重优化的依赖**全部预先声明**， 让 Vite 在启动时一次性打包完（可缓存），运行期间不再重优化、不再整页重载。
         include: [
            // 编辑器 / 语言服务（体积最大、最容易触发重优化）
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
            // 答题页其它依赖
            '@webcontainer/api',
            'xterm',
            'xterm-addon-fit',
            'marked',
            'minimatch',
            'color',
            'shiki',
            '@shikijs/monaco',
            // 通用依赖（日志中同样出现过运行中重优化）
            'dayjs',
            'dayjs/plugin/duration',
            'dayjs/plugin/relativeTime',
            // 服务端每日一题的时区计算用到，避免运行时再触发一次预构建
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
      xssValidator: false,
      rateLimiter: false,

      corsHandler: false,

      // /<style([^>]*?)>/gi、/<script([^>]*?)>/gi、/<link([^>]*?)>/gi 对**整段 HTML 字符串**做盲替换，把 nonce="…" 插进去——属性值内部也照插。 而题面 markdown 里出现 `<style>` 是常态（CSS 题尤甚），于是： <meta property="og:description" content="…补全 `<style>` 里的样式…"> ↓ 被正则改成 <meta property="og:description" content="…补全 `<style nonce="XXXX">` 里的样式…"> 凭空多出的那个 `"` 提前闭合了 content 属性，剩下的文本成了 <head> 里的 非空白文本，浏览器会把它搬进 <body> —— 做题页顶部因此多出一段乱码文本 （description 与 og:description 各断一次，所以出现两遍）。 关掉它没有安全损失： · 本项目的 CSP 已经允许 'unsafe-inline'（见下面 routeRules['/**']）， nonce / 'strict-dynamic' 本来就形同虚设； · 生效的 CSP 里不存在 'nonce-{{nonce}}' 占位符，关掉后不会留下残缺的 'nonce-{{nonce}}' 源（updateCspVariables 会把占位符替换成空串并丢弃）； · 应用侧没有任何地方读 useNonce() / csp-nonce。 根因侧也已在 app/utils/seo-text.ts 修掉（不再把裸标签喂进 head）。 这里是纵深防御：以后哪怕别的字段又把 markdown / HTML 带进 head， 也不会再被这个 HTML 改写环节撕开属性。 注意：同一批插件里的 20-subresourceIntegrity 仍是字符串正则改写， 但它只认 src/href 能命中构建产物清单的 <script>/<link>，影响面窄得多。
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
               },
            },
         },
      },
      '/challenge/**': {
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
      // 与 IMAGE_BUILD_MAX_COMPRESSED_BYTES 一致；octet-stream 请求体受 maxRequestSizeInBytes 限制
      '/api/image-builds/upload': {
         security: {
            requestSizeLimiter: {
               maxRequestSizeInBytes: 160 * 1024 * 1024,
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
      pageTransition: {
         name: 'page',
         mode: 'out-in',
      },
      head: {
         meta: [{ name: 'referrer', content: 'origin-when-cross-origin' }],
      },
   },

   hooks: {
      // 不输出 <link rel="prefetch">：HTTP/2 下浏览器会把几十个其他页面的 chunk 与首屏 modulepreload 同时发出，在出口带宽受限时直接挤占关键 JS 的带宽。路由跳转时 Vite 的 __vitePreload 仍会并行预加载目标页依赖。
      'build:manifest': (manifest) => {
         for (const key in manifest) {
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
      quanta: {
         // 出题 CLI 的最低版本，留空用 @challenge/shared/cli-version 的内置值
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
   },
});
