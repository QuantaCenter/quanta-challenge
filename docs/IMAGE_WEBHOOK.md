# 部署 webhook 契约（CI → 部署机）

CI 把镜像推到 GHCR 后，需要通知部署机去拉取并重启。本文是这条链路的**接口契约**：
CI 侧实现是 `scripts/ci/notify-deploy.mjs`（由 `.github/workflows/publish-images.yml` 的
`release` job 调用），部署机侧按本文实现一个 HTTP 端点即可。

## 流向与责任划分

```
push 到 main
   └─ CI: detect（判定哪些镜像要重建）
        └─ CI: build（matrix 并行构建，只推 sha-<短哈希>）
             └─ CI: release ── 全部成功后：移动 latest 指针 → POST 一次 webhook
                                                              │
                                          部署机: 校验签名 → 幂等判断 → 拉镜像 → 重启变化的服务
```

两条关键约定：

1. **一次发布只触发一次**。所有镜像构建完成、且**全部成功**后，CI 才发一次请求；矩阵中任一
   镜像失败则不发。部署机不需要处理"分批到达"的情况。
2. **按 digest 拉取**。请求体里带每个镜像的 `digest`，部署机应拉
   `<image>@sha256:...` 而不是 `:latest`——重放、回滚、并发时都不会拉错版本。

## 请求

```
POST <DEPLOY_WEBHOOK_URL>
Content-Type: application/json
X-Quanta-Event: images.published
X-Quanta-Delivery: 6d1f2c9a-...            # UUID，幂等键（每次投递唯一，重放时同一次运行不变）
X-Quanta-Timestamp: 1759756096             # Unix 秒
X-Quanta-Signature: sha256=<hex>           # 见下一节
```

请求体：

```json
{
  "event": "images.published",
  "delivery": "6d1f2c9a-2f6d-4b0e-9f2a-0f1c3d4e5f60",
  "repository": "QuantaCenter/quanta-challenge",
  "ref": "refs/heads/main",
  "commit": "e91faa3f1c0d5b2e8a7f6c5d4e3b2a190817263544556677889900aabbccddee",
  "shortCommit": "e91faa3",
  "tag": "sha-e91faa3",
  "publishedAt": "2026-10-06T14:18:16.000Z",
  "actor": "still-soda",
  "runId": "37477640420",
  "runUrl": "https://github.com/QuantaCenter/quanta-challenge/actions/runs/37477640420",
  "images": [
    {
      "name": "web-app",
      "service": "challenge-web-app",
      "image": "ghcr.io/quantacenter/quanta-challenge-web-app",
      "tag": "sha-e91faa3",
      "digest": "sha256:34408ac166f3f72e535007b56defd49d12cda08cd255fc53f118bba1acfbc06e"
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `delivery` | 幂等键。同一次运行的重复投递是同一个值 |
| `commit` / `shortCommit` | 本次发布的提交。部署机应记录"当前已部署的 commit"，相同则直接跳过 |
| `tag` | 本次发布的镜像标签（`sha-<短哈希>`），`images[].tag` 与之相同 |
| `images[]` | **只包含本次真正重建的镜像**，未变化的不会出现 |
| `images[].service` | docker compose 服务名；`null` 表示该镜像不由 compose 管理（见下） |
| `images[].digest` | registry 上的 manifest digest，按它拉取最精确 |

`service` 的取值：

| `name` | `service` | 说明 |
| --- | --- | --- |
| `web-app` | `challenge-web-app` | compose 服务，`docker compose pull/up` 即可 |
| `judge-scheduler` | `challenge-judge-scheduler` | 同上 |
| `judge-machine` | `null` | 跑在宿主机（端口 1889），不在默认 compose profile 里，部署机自行处理（如预拉镜像 + 重启宿主机进程） |
| `live-server` | `null` | 该镜像是调度器判题时按需构建的，通常只需预拉到本地即可 |

## 签名与校验

```
signature = hex( HMAC-SHA256( secret, "<timestamp>" + "." + <原始请求体字节> ) )
X-Quanta-Signature: sha256=<signature>
```

校验要点（缺一个就等于没签名）：

1. **必须用原始请求体字节**计算 HMAC，不要先 `JSON.parse` 再 `JSON.stringify`——键顺序、
   空格、转义都会变，签名必然对不上。先拿 raw body，校验通过后再解析。
2. 用**常量时间比较**（Node: `crypto.timingSafeEqual`），不要用 `===`。
3. 校验时间戳窗口（建议 ±300 秒）以阻止重放。
4. `X-Quanta-Delivery` / `commit` 落盘做幂等判断：同一个 `commit` 重复投递直接返回 200 +
   跳过，不要重复拉取/重启。
5. 密钥只放在 GitHub 仓库 secrets（`DEPLOY_WEBHOOK_SECRET`）与部署机的环境变量里，
   不要写进仓库文件；端点只暴露 HTTPS。

> 为什么不复用仓库里已有的 `generateOpenApiSign`（`packages/shared/service/openapi/sign.ts`）：
> 它签的是 `path + 排序后的 query + timestamp + secret`，**不覆盖请求体**，任何人拿到 URL
> 都能改报文内容；且比较用的是 `===`（非常量时间）。那个签名用于查询类回调尚可，用于
> "让服务器拉镜像并重启"这种动作太弱，所以这里另立一套（与 GitHub 自身的 webhook 签名
> 习惯一致：`sha256=<hmac>` + 时间戳 + body）。

## 响应约定

| 状态码 | 含义 | CI 侧行为 |
| --- | --- | --- |
| `200` | 部署已成功完成（同步等待结束） | 视为成功；响应体原样打印到日志 |
| `200` + `{"skipped":"already deployed"}` | 幂等命中，无需动作 | 视为成功 |
| `400` | 报文格式错误 | 流水线失败（配置问题，需人工修） |
| `403` | 签名/时间戳无效 | 流水线失败 |
| `429` | 正在部署中 | 流水线失败；本次发布未生效，需手动重放 |
| `500` | 部署失败（可能已回滚，也可能回滚失败） | 流水线失败；响应体含 `status`（`failed`/`rolled-back`/`rollback-failed`）与 `error` |
| `5xx` / 超时 | 部署机异常 | 流水线失败 |

端点**同步执行部署**，做完才回包，所以 CI 侧超时（现在 15 分钟）必须大于 `docker pull` 的最长耗时，
不能再用「先回 202 再异步拉」的写法——那样失败只有在部署机日志里才看得到。

## 部署机侧应该做什么

1. 校验签名与时间戳（见上）。
2. 幂等：记录已部署的 `commit` / `delivery`，命中则跳过。
3. 同步执行部署，完成后回包（成功 `200`，失败 `5xx`）：
   - `service` 非空的镜像：`docker compose -f <compose> pull <service...>`，成功后
     `docker compose -f <compose> up -d <service...>`（只动变化的服务，别重启全栈）；
   - `service` 为空的镜像：`docker pull <image>@<digest>` 预拉。
4. 加并发锁（`busy` 标记）避免两次发布重叠执行；重叠时返回 `429`。
5. 失败要**告警**并让调用方知道：回 `5xx`，响应体里带上失败/回滚状态，别默默吞掉。

## 本地联调

CI 侧的发包逻辑可以直接 dry-run，打印真实报文与签名：

```bash
cat > /tmp/images.txt <<'EOF'
web-app|ghcr.io/quantacenter/quanta-challenge-web-app|sha256:34408ac166f3f72e535007b56defd49d12cda08cd255fc53f118bba1acfbc06e
EOF

WEBHOOK_URL=http://127.0.0.1:19000/hooks/images \
WEBHOOK_SECRET=dev_secret \
GITHUB_REPOSITORY=QuantaCenter/quanta-challenge \
GITHUB_SHA=e91faa3f1c0d5b2e8a7f6c5d4e3b2a190817263544556677889900aabbccddee \
GITHUB_REF=refs/heads/main GITHUB_ACTOR=still-soda GITHUB_RUN_ID=123 \
node scripts/ci/notify-deploy.mjs --images-file /tmp/images.txt --tag sha-e91faa3 --dry-run
```

手工造一个合法签名（用于 curl 打服务端）：

```bash
TS=$(date +%s)
BODY='{"event":"images.published","delivery":"test","commit":"deadbeef","tag":"sha-deadbee","images":[]}'
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $NF}')
curl -i -X POST "$WEBHOOK_URL" -H 'Content-Type: application/json' \
  -H "X-Quanta-Timestamp: $TS" -H "X-Quanta-Signature: sha256=$SIG" -d "$BODY"
```

## 参考实现（部署机侧，Node ≥ 20，无依赖）

> 本仓库里已有可直接部署的实现：`ci/deploy-webhook.mjs`（systemd 服务 + 安装/联调/站点脚本，见 `ci/README.md`）。
> 下面是同一契约的最小示例，便于理解行为。

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';

const exec = promisify(execFile);
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET;
const COMPOSE = process.env.COMPOSE_FILE || '/opt/quanta-challenge/docker/docker-compose.yaml';
const STATE = process.env.STATE_FILE || '/var/lib/quanta-deploy/state.json';
const MAX_SKEW_SECONDS = 300;

const verifySignature = (timestamp, rawBody, header) => {
   const expected = createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest();
   const given = Buffer.from(String(header || '').replace(/^sha256=/, ''), 'hex');
   if (expected.length !== given.length) return false;
   if (!timingSafeEqual(expected, given)) return false;
   return Math.abs(Date.now() / 1000 - Number(timestamp)) <= MAX_SKEW_SECONDS;
};

const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
const writeState = (state) => {
   mkdirSync(dirname(STATE), { recursive: true });
   writeFileSync(STATE, JSON.stringify(state, null, 2));
};

let busy = false;

createServer((req, res) => {
   const json = (code, payload) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
   };

   if (req.method !== 'POST' || req.url !== '/hooks/images') return json(404, { error: 'not found' });

   const chunks = [];
   req.on('data', (c) => chunks.push(c));
   req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8'); // 必须保留原始字节用于验签
      if (!verifySignature(req.headers['x-quanta-timestamp'], raw, req.headers['x-quanta-signature'])) {
         return json(403, { error: 'invalid signature' });
      }

      let payload;
      try {
         payload = JSON.parse(raw);
      } catch {
         return json(400, { error: 'invalid json' });
      }

      const state = readState();
      if (state.delivery === payload.delivery || state.commit === payload.commit) {
         return json(200, { skipped: 'already deployed', tag: state.tag });
      }
      if (busy) return json(429, { error: 'deploy in progress' });

      // 同步等部署完成再回包：成功 200、失败 5xx
      busy = true;
      try {
         const services = payload.images.map((i) => i.service).filter(Boolean);
         for (const image of payload.images.filter((i) => !i.service)) {
            await exec('docker', ['pull', `${image.image}@${image.digest}`]);
         }
         if (services.length) {
            await exec('docker', ['compose', '-f', COMPOSE, 'pull', ...services]);
            await exec('docker', ['compose', '-f', COMPOSE, 'up', '-d', ...services]);
         }
         writeState({ delivery: payload.delivery, commit: payload.commit, tag: payload.tag, at: new Date().toISOString() });
      } catch (error) {
         console.error('[deploy] 失败:', error.stderr || error.message); // 这里必须接告警
      } finally {
         busy = false;
      }
   });
}).listen(Number(process.env.PORT || 19000), () => console.log('[deploy] webhook listening'));
```
