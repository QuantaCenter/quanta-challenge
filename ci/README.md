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
| `test-webhook.sh` | 本地联调：合法签名 / 幂等重放 / 错误签名 |
| `expose-hook-path.sh` | 把端点挂到既有站点的 `/hooks/images`（1Panel 的 `proxy/*.conf`） |

## 部署

```bash
sudo bash ci/install.sh            # 服务 + 密钥（幂等，可重复执行）
sudo bash ci/expose-hook-path.sh   # 挂到 challenge.quantacenter.com/hooks/images
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
2. 幂等：`delivery` 或 `commit` 与上次成功部署一致 → `200 {"skipped":"already deployed"}`；正在部署中 → `429`。
3. **先回 `202` 再异步执行**（CI 侧 15s 超时，`docker pull` 可能更久）。
4. 按 `digest` 拉取（内容寻址，镜像源无法投毒）：`ghcr.nju.edu.cn` → `ghcr.dockerproxy.net` 依次回退
   （ghcr.io 直连实测约 0.01 MiB/s，不可用，见 `DEPLOY_LOCAL.md` 第 12 节）。
5. 打标签后 `docker compose up -d` 只动变化的服务，再对 `:3000/`、`:1888/health` 做健康检查。
6. 任一步失败 → 用回滚点（部署前的 `docker inspect` 结果）重新打标签 + `up -d` + 健康检查；
   回滚也失败则状态记为 `rollback-failed` 并触发 `ALERT_WEBHOOK_URL`（若配置）。

`service` 为 `null` 的镜像（`judge-machine`、`live-server`）只预拉到本地：判题机镜像由调度器
自行构建容器，不归 compose 管，强行替换会让调度器与容器版本不一致。

状态：`/var/lib/quanta-deploy/state.json`（含最近 20 次记录、回滚点），日志 `/var/log/quanta-deploy-webhook.log`。

## 运维

```bash
systemctl status quanta-deploy-webhook
curl -s 127.0.0.1:19000/health                     # 不带密钥也只看得到状态，无敏感字段
sudo bash ci/test-webhook.sh --skipped             # 幂等重放
sudo bash ci/test-webhook.sh                       # 假 digest：验证失败路径与回滚不误伤在跑容器
sudo bash ci/test-webhook.sh --bad-sig             # 期望 403
```

服务端所有等待（HTTP 收发、拉取 20s 无进度、健康探测、compose up）上限均为 20s，没有更长的等待窗口。

## 手动重放

CI 侧超时（15s）或部署机故障导致漏发时，用同一次发布的报文重放即可，key 从
GitHub Actions 日志里取：

```bash
WEBHOOK_URL=https://challenge.quantacenter.com/hooks/images WEBHOOK_SECRET=... \
GITHUB_SHA=<commit> GITHUB_REPOSITORY=QuantaCenter/quanta-challenge GITHUB_REF=refs/heads/main \
node scripts/ci/notify-deploy.mjs --images-file /tmp/images.txt --tag sha-<短哈希>
```
