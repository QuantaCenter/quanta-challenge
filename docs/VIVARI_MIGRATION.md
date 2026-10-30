# Vivari 运行环境与镜像切换

做题页和镜像构建页使用 `@vivari/core` 1.1.4。应用启动时从 `public/assets/` 加载同版本 Worker，并从 `/sw.js` 注册主站 Service Worker。`pnpm --filter @challenge/app build` 和 `dev` 会自动同步这些文件。主站 `/assets/**` 响应必须保留 `Cross-Origin-Embedder-Policy: require-corp`，否则隔离页面会以 `kernel worker failed to load` 失败。生产环境必须设置 `VIVARI_PREVIEW_ORIGIN=https://<独立预览域名>`；未设置时编辑器会报错，避免把学生代码放在平台登录态的同源下。

`npm`、`pnpm`、`yarn` 和 `corepack` 首次使用时从主站 `/vendor/*-pack.bin` 下载真实 CLI。归档取自 [Vivari 官方 Studio](https://vivari.run/studio/)，已存入 `packages/challenge-web-app/public/vendor/`，并由资源同步脚本校验 SHA256。部署时必须一同上传这些同源资源；只安装 `@vivari/core` 不会提供它们。升级 Vivari 时重新核对归档格式、版本和校验值。

## 独立预览域名

1. Docker Compose 会启动 `vivari-preview` 静态服务，仅绑定宿主机 `127.0.0.1:3001`。把独立 HTTPS 域名反向代理到该端口，并且不要把主站 Cookie 域设置到预览子域名。它与主站使用同一镜像，保证 Vivari 版本相同。其他部署方式可运行 `pnpm --filter @challenge/app build:vivari-preview`，将 `packages/challenge-web-app/dist-vivari-preview/` 作为独立静态站点根目录部署。该目录含与主站相同版本的 `sw.js`、`__vv-bridge.html`、`__vv-preview-boot.html`、Cloudflare Pages 风格的 `_headers` 与 `_redirects`。
2. 如果部署平台不识别 `_headers` / `_redirects`，手工配置相同规则：所有预览响应需 `Cross-Origin-Embedder-Policy: credentialless`、`Cross-Origin-Resource-Policy: cross-origin`；`/sw.js` 另需 `Service-Worker-Allowed: /`；未由 Service Worker 拦截的 `/preview/*` 应重写到 `/__vv-preview-boot.html`。
3. 配置 HTTPS、`VIVARI_PREVIEW_ORIGIN`，并验证主站和预览域名的 `sw.js` 内容哈希相同。升级 Vivari 时必须同时重新构建两处资源；`scripts/sync-vivari-assets.mjs` 会在上游 HTML 注入点变化时直接失败，要求重新审查控制台补丁。
4. 在真实浏览器验证 `crossOriginIsolated`、前端 HMR、预览控制台日志与执行、后端请求，以及主站 Cookie 未发送给预览域名。控制台脚本由本仓库在 Vivari 预览 Service Worker 的 HTML 响应处注入。

## 已发布镜像的集中重建

数据库迁移增加 `image_builds.formatVersion`，旧镜像值为 `0`，Vivari 归档值为 `1`。新应用只下载和绑定版本 1；在维护窗口完成所有已引用旧镜像重建前，不得对学生开放新版做题页。

1. 备份数据库及 `local_store`，保存当前应用镜像与两个域名的静态资源版本；暂停镜像发布及题目绑定修改。
2. 部署数据库迁移和新应用到预发布环境。以 `image_builds` 中 `formatVersion = 0` 且被当前题目版本引用的记录为清单，在 `/app/publish/image?id=<镜像 ID>` 使用其保存的 `buildFile` 逐个重建并发布。上传接口校验 gzip 内的 `QVIM1` 归档并将该记录标记为版本 1，ID 与题目绑定关系不变。
3. 对每个镜像检查文件数、`node_modules` 软链接、二进制内容及执行权限；对每道引用题目实机完成启动、预览／请求和提交。全部通过后才结束维护窗口并切换生产流量。
4. 若验证失败，恢复旧应用、数据库备份及对应的镜像文件，不能仅回滚应用代码：旧 WebContainer 无法读取新归档。清空浏览器中旧格式快照缓存不是必需步骤，新代码使用 `vivari-1:` 缓存键。

题目快照上传判题的路径格式保持 `/project/...`，此镜像归档仅用于浏览器做题环境，不参与判题。
