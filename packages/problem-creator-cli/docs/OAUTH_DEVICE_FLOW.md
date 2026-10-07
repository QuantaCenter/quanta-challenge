# 设备码授权（OAuth 2.0 Device Authorization Grant）

`qpc login --device` 的实现说明。协议遵循 **RFC 8628**，客户端与授权服务器都在本仓库内。

## 为什么选设备码，而不是 loopback 重定向

RFC 8252 推荐的 loopback 重定向（`http://127.0.0.1:<port>/callback`）在**本机开发**下更顺畅：
一次点击就完成，不用看验证码。但它要求 CLI 能监听本机端口，且浏览器的
`127.0.0.1` 必须指向**CLI 所在的那台机器**。

实际使用场景里这条不成立：

| 场景 | loopback | 设备码 |
|---|---|---|
| 本机开发 | ✅ 能用 | ✅ 能用（多输一个码） |
| SSH / 跳板机（CLI 在远端） | ❌ `127.0.0.1` 是远端的，浏览器够不着 | ✅ 在任意设备打开即可 |
| CI / 容器 | ❌ 起不了可用端口，也没浏览器 | ✅ 配合 `--no-browser` 手动完成 |
| 内网自建 + 域名访问 | ⚠️ 需要处理混合内容与端口白名单 | ✅ 无额外约束 |

因此本仓库只实现设备码：少一种流程要维护，且覆盖了 loopback 覆盖不了的场景。

## 协议流程

```
      CLI（qpc）                          服务端（challenge-web-app）
          │                                          │
(1)       │ POST /api/oauth/device/authorize         │
          │   client_id, scope                       │  生成 device_code（高熵）
          │─────────────────────────────────────────▶│       user_code（人可读）
          │◀─────────────────────────────────────────│  存 Redis，TTL 600s
          │   device_code, user_code,                │
          │   verification_uri(+_complete),          │
          │   expires_in, interval                   │
          │                                          │
(2)  打印地址与验证码，打开浏览器 ──────────────────▶ /auth/device?user_code=…
                                                     │  用户核对验证码
(3)                                                  │  点“同意” → status=approved
                                                     │  （绑定 userId）
          │                                          │
(4)       │ POST /api/oauth/device/token   （轮询）    │
          │   grant_type=…:device_code,              │
          │   device_code, client_id                 │
          │─────────────────────────────────────────▶│  pending → 报错
          │◀─────────────────────────────────────────│  approved → 签发并**消费**
          │   access_token, refresh_token            │
          │                                          │
(5)  写入 ~/.config/quanta/credentials.json          │
```

## 安全决策与依据

| 决策 | 依据 | 实现位置 |
|---|---|---|
| `device_code` 用 32 字节随机（base64url） | RFC 8628 §5.2：不展示给用户，因此应尽量长 | `services/device-flow.ts` `createDeviceCode` |
| `user_code` 用 base20 × 8 位，展示为 `XXXX-XXXX` | RFC 8628 §6.1（去元音、去 `0`/`1`） | `shared/service/oauth/device-flow.ts` |
| 输错 **5 次**即作废会话 | RFC 8628 §5.1：20^8 ≈ 34.5 bit 熵，5 次尝试即达到 2⁻³² 成功概率 | `registerFailedAttempt` + 调用方 |
| 批准**必须显式确认**，页面展示账号/应用/权限 | RFC 8628 §3.3、§5.4（防远程钓鱼：核对验证码） | `app/pages/auth/device/index.vue` |
| token 端点的凭据就是 `device_code`，**不做** cookie/CSRF 校验 | CLI 没有浏览器会话；`device_code` 是只有发起者知道的高熵秘密 | `server/api/oauth/device/token.post.ts` |
| 换到 token 后 `device_code` 立即失效 | RFC 8628 §3.5：授权码必须一次性 | `consume()` 用条件 `del` 保证原子 |
| 输入归一化：去横线/空格、转大写、剔除非法字符 | RFC 8628 §6.1 明确要求（否则粘贴带空格的码会“看起来正确却失败”） | `normalizeUserCode` |
| IP 维度限速 | RFC 8628 §3.1（轮询型协议需注意端点容量） | `server/middleware/oauth-device-rate-limit.ts` |
| 角色从**数据库**读取而非沿用旧 token | 用户可能在授权期间被降权（与 `renewTokens()` 一致） | `token.post.ts` |

### 与 user_code 相关的两个易错点

1. **归一化必须两端一致**。服务端把 `WDJB-MJHT` 存成 `WDJBMJHT`，CLI 与确认页也必须
   做同样的归一化。任一侧漏做，就会表现为“用户输入完全正确但查不到会话”。
   因此归一化函数放在 `@challenge/shared/oauth`，由两端共同引用。

2. **爆破防护按 user_code 计数，而不是按 IP**。攻击者可以换 IP 绕过 IP 限速，
   而 user_code 的搜索空间本来就只有 20⁸。计数键 `oauth:user-attempts:<code>`
   在会话过期时一并失效。

## 服务端契约（改 CLI 前先看这里）

| 端点 | 鉴权 | 说明 |
|---|---|---|
| `POST /api/oauth/device/authorize` | 无（只校验 `client_id`） | 返回 §3.2 的字段；**不接收 redirect_uri**，因此无开放重定向面 |
| `POST /api/oauth/device/token` | `device_code` 本身 | 成功返回 RFC 6749 §5.1 令牌；失败返回 §3.5 的 `authorization_pending` / `slow_down` / `access_denied` / `expired_token` |
| `GET /api/oauth/device/session` | 登录 session | 确认页用；查不到会消耗一次尝试次数 |
| `POST /api/oauth/device/decision` | 登录 session **+ CSRF** | 用户同意/拒绝；这是最需要防 CSRF 的写操作 |
| `GET /auth/device`（页面） | 未登录会先跳登录 | `verification_uri` |

`client_id` 固定为 `quanta-problem-creator-cli`，**没有 client_secret**：
RFC 8252 §8.5 指出分发给客户端的 secret 不构成秘密，
自研场景下发一个静态密钥只会增加分发负担而换不来安全性。
真正防止授权码被截获的是 `device_code` 的高熵 + 一次性消费。

## CLI 的轮询规则（RFC §3.5）

CLI 侧必须实现以下行为，否则会出现"服务端要求慢一点但客户端继续猛打"的相互拖累：

- 默认间隔取服务端下发的 `interval`（缺省 **5 秒**）。
- 收到 `slow_down`：间隔 **+5 秒**，且对**后续所有**请求持续生效（不是只慢一次）。
- 收到 `authorization_pending`：继续等，直到 `expires_in` 到期。
- 收到 `access_denied` / `expired_token`：**立即停止**轮询。
- 网络超时：**指数退避**（每次翻倍），连续 5 次才放弃。

实现见 `src/services/device-flow.ts`；`tests/unit/device-flow.test.ts` 用真实计时
断言了 `slow_down` 之后间隔确实变长。

## 如何手工验证一遍

```bash
# 1. 起服务
docker compose -f docker/docker-compose.yaml up -d
pnpm --filter @challenge/problem-creator-cli build

# 2. 发起设备授权（--no-browser 便于观察输出）
node packages/problem-creator-cli/dist/index.js login --device --no-browser

# 3. 在浏览器打开打印出的地址，输入验证码，点“同意”
#    → 终端应在下一次轮询时输出“已登录：…”

# 4. 确认凭据已落盘且权限正确
ls -l ~/.config/quanta/credentials.json    # 应为 -rw-------
```

失败时的排查顺序：

1. `qpc doctor` —— 先确认 API 可达、登录态有效、角色是 ADMIN。
2. 终端打印的地址能否在浏览器打开？不能则是 `verification_uri` 的 Host 推导问题
   （见 `server/utils/public-url.ts`，它优先用请求的 Host / `x-forwarded-*`）。
3. 页面报"验证码不存在或已过期" —— 检查两端是否用了同一份归一化逻辑；
   若已输错 5 次，需回到终端重新发起。
4. 终端一直停在"等待授权完成" —— 看服务端日志里 `/api/oauth/device/token`
   返回的是 `authorization_pending`（正常）还是别的错误（如 Redis 未连通）。
