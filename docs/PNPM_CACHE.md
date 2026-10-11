# 共享 pnpm 缓存（PNPM Cache）

题目容器启动时要安装用户项目的依赖。为了避免每次判题都去公网下载，调度器维护一份
**共享的 pnpm content-addressable store**（下称"缓存"），题目容器**只读挂载**它并用
`--offline` 安装。

本方案集成在 `challenge-judge-scheduler` 内（`src/services/pnpm-cache.ts`）。

> 一份诚实的说明：`pnpm fetch` 只预热 **npm registry 这一层**。包在 postinstall 里
> "自己去下载"的东西（Prisma 引擎、Playwright 浏览器）属于**另一条供应链**，
> 需要额外处理 —— 见 §6。

## 1. 角色与边界

| 角色 | 是谁 | 对缓存目录 | 做什么 |
|---|---|---|---|
| **写入方（唯一）** | `PnpmCacheService`（调度器进程） | **读写** | `POST /cache/update`：在题目镜像容器里跑完整安装，预热缓存 |
| **只读消费方** | 题目容器 | **只读** | 启动时挂载并用 `--offline --frozen-lockfile` 安装 |
| 门禁 | `PnpmCacheService`（调度器进程） | 只读 | `POST /cache/verify`：起题目镜像 + 断网 + 只读，试装一次 |

**只有调度器能改缓存；题目容器永远只读消费。**

## 2. 固定路径约定

```
宿主机  ${PNPM_CACHE_HOST_DIR:-/app/pnpm-cache}
  ↕ bind mount（读写）
调度器容器  /app/pnpm-cache          ← PNPM_CACHE_DIR
  ↕ bind mount（只读，Source 用宿主机路径）
题目容器    /pnpm-store               ← PROBLEM_CONTAINER_STORE_PATH
```

三处必须是**同一个宿主机绝对路径**：调度器是通过 Docker daemon 创建题目容器的，
daemon 按宿主机文件系统解析 bind mount 的 `Source`，容器私有路径它看不到
（与 `TEMP_DIR=/app/tmp` 同一个坑）。

因此 `PNPM_CACHE_DIR` 按「进程所在环境」分两种规范值，由
`src/utils/pnpm-cache-path.ts` 的 `resolvePnpmCacheDir()` 统一解析：

| 运行方式 | 规范目录 | 来源 |
|---|---|---|
| `pnpm dev` / `pnpm start`（宿主机） | `<仓库根>/.pnpm-cache` | 未配置时的兜底（`.gitignore` 已忽略） |
| 调度器容器 | `/app/pnpm-cache` | compose 显式注入 `PNPM_CACHE_DIR` |

> 切勿把容器路径写进宿主机侧的 `.env`。`pnpm dev` 会真的去 `mkdir /app/pnpm-cache`，
> 在 macOS/Linux 上根目录不可写，表现为启动即失败：
> `ENOENT: no such file or directory, mkdir '/app'`。

解析规则（与 `resolveLocalStorePath()` 同一套收紧策略）：

1. `PNPM_CACHE_DIR` 是绝对路径 -> 用它；
2. 配的是相对路径 -> 忽略并告警，改用规范目录（相对路径按各进程 cwd 解析，
   而 daemon 按宿主机解析，两边必然对不上）；
3. 未配置 -> 容器内用 `/app/pnpm-cache`，宿主机用 `<仓库根>/.pnpm-cache`。

## 3. 关键设计：预热必须发生在"题目镜像"里

这是踩坑之后定下来的，原因见 §5：

- `POST /cache/update` **不**在调度器进程里跑 pnpm，而是
  **用题目容器镜像起一个一次性容器**，把 store 挂成可写、项目目录挂进去，在容器里
  跑 `pnpm install --frozen-lockfile --store-dir /pnpm-store`。
- 这样 openssl / libc / arch / 基础镜像 / 环境变量**全部天然一致**，
  一整类"预热环境 ≠ 消费环境"的问题直接消失。
- **缓存按镜像 digest 版本化**：预热后把镜像名、digest、平台写进
  `<cacheDir>/.quanta-pnpm-cache.json`。`verify` 会先比对 digest，不一致直接判过期，
  提示重新预热，而不是等题目容器跑到一半才炸。

配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PNPM_CACHE_DIR` | 容器 `/app/pnpm-cache`；宿主机 `<仓库根>/.pnpm-cache` | 缓存目录（**必须是宿主机绝对路径**，见 §2） |
| `PNPM_CACHE_PROBLEM_IMAGE` | 空 | **题目容器镜像**；预热/门禁都从这里起容器 |
| `PNPM_CACHE_WARM_NETWORK` | `bridge` | 预热容器的网络（需要能访问 registry） |
| `PNPM_CACHE_WARM_DIR` | `$TEMP_DIR` | 临时项目目录根，必须宿主机可见 |
| `PNPM_CACHE_EXTERNAL_REGISTRY` | `https://registry.npmjs.org/` | 外部上游 |
| `PNPM_CACHE_INTERNAL_REGISTRY` | `http://127.0.0.1:4873/` | 内部/私有上游 |

> 未设置 `PNPM_CACHE_PROBLEM_IMAGE` 时会退化为"调度器进程内预热"，只用于本地调试：
> 不保证环境一致，日志里会有 WARN。

## 4. HTTP API（调度器，端口 1888）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/cache` | 缓存路径、包数量/体积、上游、上次预热的镜像元数据 |
| `POST` | `/cache/update` | 在题目镜像容器里预热 `project` 或 `packages` |
| `POST` | `/cache/verify` | 起题目镜像 + 断网 + 只读 store，试装一次；缓存过期会拒绝 |

```bash
# 预热一个含锁文件的题目快照目录
curl -X POST localhost:1888/cache/update -H 'content-type: application/json' \
  -d '{"source":"external","project":"/app/tmp/<snapshot>"}'

# 点名列包（容器内会先解析出锁文件，带上传递依赖）
curl -X POST localhost:1888/cache/update -H 'content-type: application/json' \
  -d '{"source":"external","packages":["vue@3.5.13","zod@3.24.1"]}'

# 启动题目容器前的门禁（这是最贴近真实的检查）
curl -X POST localhost:1888/cache/verify -H 'content-type: application/json' \
  -d '{"project":"/app/tmp/<snapshot>"}'
```

## 5. 未来题目容器怎么接

```ts
import { PnpmCacheService } from './pnpm-cache';

const container = await this.docker.createContainer({
  Image: PNPM_CACHE_PROBLEM_IMAGE,        // 与预热用的镜像必须一致
  HostConfig: {
    Mounts: [
      /* ...已有的快照挂载... */
      PnpmCacheService.instance.problemContainerMount(),
      // => { Type:'bind', Source:'/app/pnpm-cache', Target:'/pnpm-store', ReadOnly:true }
    ],
    // 建议：题目容器不给网络（既是沙箱，也是可复现的前提）
    NetworkMode: 'none',
  },
});
```

容器内安装依赖必须是：

```bash
pnpm install --offline --frozen-lockfile --store-dir /pnpm-store
```

## 6. 实测结论：`pnpm fetch` 管不到的层，以及怎么处理

我们用一个含 `prisma`/`@prisma/client` 6.12.0 的项目做了端到端实测。

| 层 | 谁负责 | 断网 + 只读 store 下的结果 |
|---|---|---|
| npm tarball | pnpm store | ✅ 全部 reused，装得上 |
| postinstall 自下载（Prisma 引擎） | pnpm 的 **side-effects cache** | ✅ **同平台预热**时命中还原；❌ 跨平台/跨 openssl 变体时 miss |
| CLI 二次下载（`prisma generate`） | 没人管 | ❌ 仍去 `binaries.prisma.sh`，需用 env 指路 |

### 6.1 pnpm 的 side-effects cache 会缓存 postinstall 产物

预热后 store 里会出现 `v3/files/**-exec`，那就是 Prisma 引擎。断网 + 只读的容器里：

```
pnpm install --offline --frozen-lockfile  →  exit 0，1.3s
schema-engine-linux-arm64-openssl-*.x          (ELF, 24M)
libquery_engine-linux-arm64-openssl-*.x.so.node (ELF, 19M)
```

**但它是环境相关的**：macOS 预热得到 Mach-O 引擎，linux 容器不复用 → 重新下载 → 断网失败
（fail-closed，不会给你一个坏二进制，但白预热）。所以 §3 才要求"在题目镜像里预热"。

### 6.2 Prisma 这类"自下载"依赖的完整配方

1. **在题目镜像里预热**（§3）→ pnpm store + side-effects cache 覆盖引擎。
2. 若题目容器还要跑 `prisma generate`，它仍会二次下载。**把指针指到已还原的引擎**：
   ```bash
   export PRISMA_QUERY_ENGINE_LIBRARY=<...>/libquery_engine-linux-*.so.node
   export PRISMA_SCHEMA_ENGINE_BINARY=<...>/schema-engine-linux-*
   ```
   实测：断网 `prisma generate` 成功，50ms 生成 Client。
3. `openPrisma` 的 engine 文件名带 `openssl-1.1.x` / `openssl-3.0.x`，取决于容器里有没有
   系统 openssl。**预热镜像和消费镜像必须是同一个镜像**，否则两边算出的 binaryTarget 不同 →
   文件名对不上 → miss → 断网失败。
4. 没有 env 逃生门的工具（Playwright/Puppeteer 浏览器等）：走 CDN 镜像代理，
   或者直接快照装好的 `node_modules`（按锁文件哈希 + 镜像 digest 存），变成"挂载"而非"安装"。

### 6.3 其它实测约束

1. **必须用 `pnpm install`/`pnpm fetch` 预热，不能用 `pnpm store add`**：后者不拉传递依赖，
   会造出内容不一致的 store（实测 `store add is-odd@3.0.1` 后 `is-number` 缺失）。
2. **pnpm 大版本必须一致**：store 磁盘布局与 pnpm 大版本绑定（pnpm 9 = `v3/`，
   pnpm 10 = `v10/`），跨版本 100% 未命中。
3. **`--offline` + 只读挂载缺一不可**：只加只读不加 `--offline`，pnpm 仍会先联网再在
   写回 store 处失败，更慢更脏。不要用 `--prefer-offline`（要求 store 可写，等于放弃保证）。
4. **只读 store 会挡住 pnpm 回写新的 side effects**（日志 `WARN ... uploading ...`）：
   无害，命中就还原，不命中就 fail-closed。
5. **`pnpm fetch` 不是零副作用**：它会在 `cwd` 生成 `node_modules/.pnpm`（虚拟 store），
   所以传 `project` 时必须是可写的临时快照目录。
6. **镜像更新必须重新预热**：换基础镜像、加减系统包、升 openssl 都会让 digest 变化，
   `verify` 会拒绝旧缓存。

## 7. 量化结论

工作负载：66 个包、76MB store、纯 JS、linux/arm64。

| 场景 | 用时 |
|---|---:|
| 冷装（缓存完全未命中） | 23.3s |
| 半命中 | 16.7s |
| 全命中（`pnpm install --offline`） | 6.3s |
| 门禁（`verify`，满缓存） | ~1–2s |

- 缓存把一次冷装从 **23.3s 压到 6.3s（约 3.7×）**，省下的主要是网络下载。
- Docker 镜像构建端到端会被固定开销（拉基础镜像、导出/解包层、装 pnpm 工具）稀释；
  依赖树越大，收益越明显。
- 门禁用 ~1–2s 换掉"跑到一半才发现缺包/环境不匹配"。
