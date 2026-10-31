# Vivari 运行环境与镜像切换

做题页和镜像构建页使用 `@vivari/core` 1.1.4。应用启动时从 `public/assets/` 加载同版本 Worker；通配预览模式在各预览子域名注册 `/sw.js`。`pnpm --filter @challenge/app build` 和 `dev` 会自动同步这些文件。主站 `/assets/**` 响应必须保留 `Cross-Origin-Embedder-Policy: require-corp`，否则隔离页面会以 `kernel worker failed to load` 失败。生产环境设置 `VIVARI_PREVIEW_WILDCARD_DOMAIN=preview.quantacenter.com`（填写基域名，不含 `*.` 或协议）；未设置时编辑器会报错，避免把学生代码放在平台登录态的同源下。

`npm`、`pnpm`、`yarn` 和 `corepack` 首次使用时从主站 `/vendor/*-pack.bin` 下载真实 CLI。归档取自 [Vivari 官方 Studio](https://vivari.run/studio/)，已存入 `packages/challenge-web-app/public/vendor/`，并由资源同步脚本校验 SHA256。部署时必须一同上传这些同源资源；只安装 `@vivari/core` 不会提供它们。升级 Vivari 时重新核对归档格式、版本和校验值。

## 独立预览域名

1. Docker Compose 会启动 `vivari-preview` 静态服务，仅绑定宿主机 `127.0.0.1:3001`。将 `*.preview.quantacenter.com` 的 DNS、覆盖该通配域名的 HTTPS 证书及反向代理指向该端口；不要把主站 Cookie 域设置到预览子域名。每次 Vivari boot 生成独立子域名，预览地址形如 `https://<token>.preview.quantacenter.com/preview/<port>/`。同一道题重复打开使用不同源和不同 Service Worker，同一运行实例的端口共用该实例的 SW。使用 SDK 独立预览源模式，在启动内核前等待桥接完成，避免端口就绪后才注册 SW 的首次导航竞争。它与主站使用同一镜像，保证 Vivari 版本相同。其他部署方式可运行 `pnpm --filter @challenge/app build:vivari-preview`，将 `packages/challenge-web-app/dist-vivari-preview/` 作为独立静态站点根目录部署。该目录含与主站相同版本的 `sw.js`、`__vv-bridge.html`、`__vv-preview-boot.html`、Cloudflare Pages 风格的 `_headers` 与 `_redirects`。
2. 如果部署平台不识别 `_headers` / `_redirects`，手工配置相同规则：所有预览响应需 `Cross-Origin-Embedder-Policy: credentialless`、`Cross-Origin-Resource-Policy: cross-origin`；`/sw.js` 另需 `Service-Worker-Allowed: /`；未由 Service Worker 拦截的 HTML 导航应重写到 `/__vv-preview-boot.html`（包括根路径和深链接）。
3. 配置 HTTPS、`VIVARI_PREVIEW_WILDCARD_DOMAIN`，并验证主站和任一预览子域名的 `sw.js` 内容哈希相同。升级 Vivari 时必须同时重新构建两处资源；`scripts/sync-vivari-assets.mjs` 会在上游 HTML 注入点变化时直接失败，要求重新审查控制台补丁。
4. 在真实浏览器同时打开同一道题两次，确认预览子域名不同且两个页面互不串流；再验证 `crossOriginIsolated`、前端 HMR、预览控制台日志与执行、后端请求，以及主站 Cookie 未发送给预览域名。控制台脚本由本仓库在 Vivari 预览 Service Worker 的 HTML 响应处注入。

## Service Worker 补丁登记

上游发布的 `sw.js` 由 `scripts/sync-vivari-assets.mjs` 按锚点注入三段补丁后生成，主站 `public/sw.js` 与预览站 `dist-vivari-preview/sw.js` 来自同一次生成，内容必须逐字节一致（双域哈希相同是硬性要求）。任何锚点在 SDK 升级后失配时脚本会直接失败，需重新审查补丁点而不是绕过断言。

1. **patch #1（钉死 Worker 资源直连）**：`/assets/<kernel|fs|fetcher|process|python-lsp>-worker-*.js` 这类 SDK 自有模块 Worker 的请求直接放行给浏览器。被打断的模块 Worker 请求一旦经 `passThrough()` 重发，在 COEP 隔离下可能失败。
2. **patch #2（预览控制台注入）**：在 Vivari SW 返回的 HTML 响应 `</head>` 处注入 `buildPreviewConsoleScript('__PARENT_WINDOW__')` 产出的控制台脚本。
3. **patch #3（预览客户端身份表，identity-first 路由）**：修复预览工程 Vite root 不在 workspace 根（例 `npx vite --port 3000 ./project`）时做题页刷新必现 `/@vite/client` 加载失败的问题。根因：root 外模块经 `import.meta.env` 垫片以 `/@fs/<绝对路径>` 形态 import；该请求的 referrer 是 Vite client 自身（root-absolute 的 `/@vite/client`），既不含 `/preview/<port>/`（`referrerIsPreview` 判不中）也不是 `/@fs/` 开头的内部 dev 模块（`referrerIsOwnDevModule` 判不中），`/@fs/` 分支按 referrer 形态误判为可放行，交给 HTTP 静态层 404，Vite client 的 import 链断裂。修法：SW 在自身 serve 的 `/preview/<port>/` 导航上登记 `resultingClientId → port`（`vvPreviewClients` 表），fetch 阶段对命中身份的 client，`/@fs/` 与 env-import 两处形态学分歧点优先按身份直送对应 VM；身份 miss（speculative 预加载的空 clientId、SW 被回收后）回落原 referrer 判据，studio 侧全部 bypass 语义不变。表格容量超 4096 整体清空，clientId 不会复用，陈旧项无害。wildcard（mode C）部署下所有请求本就按路径整体路由，不受该缺陷影响，补丁不涉及。

若曾为该缺陷在反代层以 `alias` 临时替换 `/sw.js`（referrer 特判热修版），含 patch #3 的镜像上线后必须立即删除反代中的热修配置并 reload：热修会以旧语义覆盖新生成的 `sw.js`，并破坏双域哈希一致。

## 已发布镜像的集中重建

数据库迁移增加 `image_builds.formatVersion`，旧镜像值为 `0`，Vivari 归档值为 `1`。新应用只下载和绑定版本 1；在维护窗口完成所有已引用旧镜像重建前，不得对学生开放新版做题页。

1. 备份数据库及 `local_store`，保存当前应用镜像与两个域名的静态资源版本；暂停镜像发布及题目绑定修改。
2. 部署数据库迁移和新应用到预发布环境。以 `image_builds` 中 `formatVersion = 0` 且被当前题目版本引用的记录为清单，在 `/app/publish/image?id=<镜像 ID>` 使用其保存的 `buildFile` 逐个重建并发布。上传接口校验 gzip 内的 `QVIM1` 归档并将该记录标记为版本 1，ID 与题目绑定关系不变。
3. 对每个镜像检查文件数、`node_modules` 软链接、二进制内容及执行权限；对每道引用题目实机完成启动、预览／请求和提交。全部通过后才结束维护窗口并切换生产流量。
4. 若验证失败，恢复旧应用、数据库备份及对应的镜像文件，不能仅回滚应用代码：旧 WebContainer 无法读取新归档。清空浏览器中旧格式快照缓存不是必需步骤，新代码使用 `vivari-1:` 缓存键。

题目快照上传判题的路径格式保持 `/project/...`，此镜像归档仅用于浏览器做题环境，不参与判题。
