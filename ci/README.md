# ci/ —— 部署机侧

CI 把镜像推到 GHCR 后回调本目录的 webhook，由它拉镜像、重启对应容器；失败自动回滚。
报文契约与签名规则见 [`docs/IMAGE_WEBHOOK.md`](../docs/IMAGE_WEBHOOK.md)（CI 侧发包脚本是
`scripts/ci/notify-deploy.mjs`，已在 `publish-images.yml` 的 release job 里调用）。

## 文件

| 文件 | 作用 |
| --- | --- |
| `deploy-webhook.mjs` | webhook 服务本体（Node ≥ 20，无第三方依赖） |
| `quanta-deploy-webhook.service` | systemd 单元模板（安装脚本会替换路径） |
| `install.sh` | 安装/更新服务、生成密钥、给 compose override 注入 `WEB_APP_REF` |
| `expose-hook-path.sh` | 把端点挂到既有站点的 `/hooks/images`（1Panel 的 `proxy/*.conf`） |
| `docker/docker-compose.web-slot.yaml` | Web 蓝绿 slot overlay（`qc-web-blue` / `qc-web-green`） |
| `install-web-bluegreen.sh` | 初始化 upstream 指针 + OpenResty include 片段 |
| `switch-web-upstream.sh` | 切换 active 端口并重载 OpenResty |

## 部署

```bash
sudo bash ci/install.sh                 # 服务 + 密钥（幂等，可重复执行）
sudo bash ci/install-web-bluegreen.sh   # Web 蓝绿 upstream（首次或升级后）
sudo bash ci/expose-hook-path.sh        # 挂到 challenge.quantacenter.com/hooks/images
```

然后在 GitHub 仓库 secrets 里填（`install.sh` 结尾会打印现成两行）：

```
DEPLOY_WEBHOOK_URL=https://challenge.quantacenter.com/hooks/images
DEPLOY_WEBHOOK_SECRET=<安装时生成的 32 字节 hex>
```

不单独申请子域名：现有站点是 1Panel OpenResty 反代，站点配置里本来就有
`include /www/sites/<域名>/proxy/*.conf`，加一个 `location` 即可，证书也用现成的。
端点只放行 POST，鉴权完全靠签名。

## 行为

1. 校验 `sha256(HMAC(secret, "<timestamp>.<raw body>"))`（常量时间比较）+ 时间戳窗口 ±300s + `X-Quanta-Event`。
2. 幂等：`delivery` 一致，或 `commit` 一致**且本次 `images[]` 里的 digest 都已在记录里** → `200 {"skipped":"already deployed"}`；正在部署中 → `429`。
   不用 `commit` 单独做幂等键：同一个 commit 可以分批发布（`images[]` 只含本次重建的镜像，
   比如先 `-f images=live-server` 再 `-f images=web-app`），只按 commit 判会把后一批错当成已部署。
3. **异步执行，结果可查**：CI 带 `X-Quanta-Async: 1` 时先回 `202` 再后台部署，CI 轮询
   `GET /hooks/images?delivery=<delivery>` 拿 `ok` / `failed` 终态。不再同步扛着十几分钟回包——
   那条长连接会被中间 NAT 在几分钟内静默掐断，CI 只能报超时假失败（2026-10-17 两次发布即是）。
   旧客户端仍走同步回包（成功 `200`，失败 `5xx`）。
4. 按 `digest` 拉取（内容寻址，镜像源无法投毒），**4 路并行**（`PULL_CONCURRENCY`），
   失败按 `ghcr.dockerproxy.net` → `ghcr.nju.edu.cn` 依次回退
   （ghcr.io 直连实测约 0.01 MiB/s，不可用，见 `DEPLOY_LOCAL.md` 第 12 节）；
   镜像一多时并行能把总耗时从「串行求和」压到「最慢的那个镜像」附近。
5. **`challenge-web-app` 蓝绿**（默认开启，设 `WEB_BLUEGREEN=0` 可退回主栈原地重启）：
   inactive slot（`qc-web-blue`@3000 ↔ `qc-web-green`@3002）先 `up --force-recreate` →
   探活 `127.0.0.1:<slot-port>/`（60s）→ `switch-web-upstream.sh` 切 OpenResty →
   停 active slot 与主栈遗留的 web 容器。`state.json` 含 `activeWebSlot` / `webSlots`。
   其它服务仍 `docker compose up -d --no-deps`，再对 `:1888/health`、`:1890/healthz`、
   `:9310/healthz` 做健康检查（web 公网流量不再依赖固定 `:3000` 探针）。
   启动调度器前先移除占用 1889 的残留容器（前端判题机容器由调度器自己创建，不随上一实例退出而消失）。
6. 任一步失败 → 用回滚点（部署前的 `docker inspect` 结果）重新打标签 + `up -d` + 健康检查；
   回滚也失败则状态记为 `rollback-failed` 并触发 `ALERT_WEBHOOK_URL`（若配置）。

`service` 为 `null` 的镜像（`judge-machine`、`live-server`、`backend-service`、
`backend-judge-machine`）不归 compose 管：webhook 把它们拉到本地，并把调度器使用的本地名
（`challenge-live-server-agent:latest` 等）指到本次拉取的镜像，不碰容器（容器由调度器创建，
强行替换会让调度器与容器版本不一致）。

### 云函数服务（`challenge-cloud-function`）

它和调度器一样在 compose 里没有 `image:`，webhook 按「容器正在用的标签」重打后再
`up -d --no-deps`。两点特殊：

- **健康探测窗口 60s**（其余服务 20s）：容器启动时先跑 `prisma migrate deploy` 再拉起
  Node，冷启会明显慢于调度器；`/healthz` 会实际 ping Redis 与 Postgres，依赖没好返回 503。
- 探测地址 `http://127.0.0.1:1890/healthz`，基础 compose 里把这个端口**只绑回环**就是为了
  让 webhook（跑在宿主机上）能探到，同时不把服务暴露到公网。

**首次上线必须手工执行**：这版新增了 `CF_INTERNAL_KEYS`、`CF_MASTER_SECRETS`、
`CF_WEBAPP_SECRET`、`CF_JUDGE_SECRET` 四个必填密钥，而 webhook 的回滚点在容器不存在时是空的
（`snapshot()` 拿不到 `ref`），自动发布无法完成首次创建：

```bash
cd /www/quanta-challenge
# 先按 docker-compose.yaml 的 ${...:?} 提示把四个密钥写进 /www/qc-secrets/prod.env
docker compose --env-file /www/qc-secrets/prod.env -f docker/docker-compose.yaml \
  up -d --build challenge-cloud-function
curl -s 127.0.0.1:1890/healthz   # 期望 {"ok":true,...}
```

之后它的镜像由 `publish-images.yml` 随 `cloud-function` 矩阵项发布（推 GHCR），webhook 自动接管。
注意 `challenge-web-app` 与调度器都 `depends_on` 它，这个容器不存在时两者起得来但调云函数会
DNS 解析失败。

### 监控栈自研服务（`observation`）

它是监控栈（`packages/challenge-observation/deploy/docker-compose.yml`）这个**独立 compose 项目**里的
服务，webhook 拉取发布镜像后重打为本地标签 `challenge-observation:latest`，再用监控栈自己的
compose 文件（带项目目录下的 `.env`）`up -d --no-deps observation`，健康检查 `:9310/healthz`。
监控栈其余组件（Prometheus/Loki/Grafana 等）用上游官方镜像，不随发布更新。

状态：`/var/lib/quanta-deploy/state.json`（含最近 20 次记录、回滚点、`activeWebSlot`），日志 `/var/log/quanta-deploy-webhook.log`。

### Web 蓝绿（部署机一次性）

1. 在站点反代 web 的 `location` 里、`proxy_pass` 前加入（路径见 `install-web-bluegreen.sh` 输出）：
   `include .../web-bluegreen-upstream.conf;` 与 `proxy_pass http://$web_backend;`
2. `prod.env` 建议：`APP_SERVER_URL=${APP_SERVER}`，判题回调与公网切流一致。
3. 若此前 web 跑在主栈 `quanta-challenge` 项目里，首次发布后 webhook 会停掉主栈 web，改由 slot 接管；也可事先手工 `compose stop challenge-web-app`。
4. 共享卷 `qtc_app_storage` 同一时刻只应有一个 web 挂载；切流后会立刻停掉旧 slot。
5. 网络/卷全名若非默认，在 systemd 或 `deploy-webhook.env` 里设 `WEB_BG_NETWORK` / `WEB_BG_VOLUME`（默认 `quanta-challenge_quanta-challenge-network` / `quanta-challenge_qtc_app_storage`）。

## 运维

```bash
systemctl status quanta-deploy-webhook
curl -s 127.0.0.1:19000/health                     # 不带密钥也只看得到状态，无敏感字段
```

服务端超时：`docker pull` 的静默上限为 **8 分钟**（`PULL_IDLE_MS`；judge-machine 这类 2.46GB 镜像
冷拉时实测会出现 40s+ 完全无输出，按 20s 判会被误杀），其余等待（HTTP 收发、健康探测、compose up）
上限为 20s。CI 走 202 + 轮询后不再有长静默连接，nginx 的 900s / CI 的 40 分钟只是给同步模式兜底。

同步模式的兜底仍靠 TCP keepalive（`KEEPALIVE_MS=60s`），但它挡不住中间 NAT / 代理对长静默连接的
静默回收（GitHub 托管 runner 出网实测约 4 分钟）——这正是改用 202 + 轮询的原因。

## 手动重放

CI 侧超时（现在 15 分钟）或部署机故障导致漏发时，用同一次发布的报文重放即可，key 从
GitHub Actions 日志里取：

```bash
WEBHOOK_URL=https://challenge.quantacenter.com/hooks/images WEBHOOK_SECRET=... \
GITHUB_SHA=<commit> GITHUB_REPOSITORY=QuantaCenter/quanta-challenge GITHUB_REF=refs/heads/main \
node scripts/ci/notify-deploy.mjs --images-file /tmp/images.txt --tag sha-<短哈希>
```
