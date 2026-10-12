# Judge Machine Agent

**Judge Machine Agent** 是 Quanta 前端挑战平台的自动化评测服务，基于 Playwright 实现浏览器自动化测试，负责执行评测脚本并返回测试结果。

## 目录

- [概述](#概述)
- [核心功能](#核心功能)
- [通信协议](#通信协议)
- [开发指南](#开发指南)
- [Docker 部署](#docker-部署)
- [API 参考](#api-参考)

## 概述

Judge Machine Agent 运行在 Docker 容器中，通过 WebSocket 与评测调度器 (Judge Scheduler) 通信。当收到评测任务时，它会使用 Playwright 打开用户代码运行的页面，执行预定义的测试脚本，并将结果（包括截图、测试数据等）返回给调度器。

### 主要职责

- 接收评测任务请求
- 使用 Playwright 访问目标页面
- 在沙箱环境中执行评测脚本
- 收集测试结果和截图
- 通过 JRTP 协议返回评测结果

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                 Judge Machine Agent                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │   Hono Server   │  │     WebSocket Handler       │   │
│  │   (HTTP API)    │  │   (任务接收/结果返回)        │   │
│  └────────┬────────┘  └──────────────┬──────────────┘   │
│           │                          │                  │
│           ▼                          ▼                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │              JudgeService (单例)                 │    │
│  │  ┌─────────────────┐  ┌─────────────────────┐   │    │
│  │  │   VM2 沙箱      │  │   评测脚本执行器     │   │    │
│  │  └─────────────────┘  └─────────────────────┘   │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │           PlaywrightService (单例)              │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐    │    │
│  │  │ Browser 1 │  │ Browser 2 │  │ Browser N │    │    │
│  │  └───────────┘  └───────────┘  └───────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 核心功能

### 1. Playwright 服务

- **浏览器池管理**: 维护多个 Chromium 实例，支持并发评测
- **页面生命周期管理**: 自动创建和销毁页面上下文
- **健康检查**: 定期检测浏览器实例状态

### 2. 评测服务

- **任务验证**: 使用 Zod 校验评测任务数据
- **沙箱执行**: 通过 VM2 在隔离环境中运行评测脚本
- **结果收集**: 汇总测试点结果、截图和缓存文件

### 3. JRTP 传输协议

**Judge Result Transfer Protocol (JRTP)** 是专为评测结果传输设计的二进制协议，支持高效传输包含 Buffer 数据的复杂对象。

协议结构：

```
[JSON长度(4字节)] + [JSON数据] + [Buffer数据...]
```

## 通信协议

### WebSocket 连接

- **端点**: `ws://<host>:3000/link`
- **消息格式**: JSON (请求) / JRTP Binary (响应)

### 任务请求格式

```typescript
interface TaskPayload {
  judgeRecordId: string;   // 评测记录 ID
  judgeScript: string;     // 评测脚本代码
  mode: 'audit' | 'judge'; // 评测模式
  url: string;             // 目标页面 URL
  info?: CacheFileInfo;    // 缓存文件信息（judge 模式）
}
```

### 评测结果格式

```typescript
// 成功结果
interface JudgeSuccessResult {
  type: 'success';
  judgeRecordId: string;
  judgeTime: number;
  results: CheckPointResult[];
  firstScreen?: Buffer;    // 首屏截图（audit 模式）
}

// 错误结果
interface JudgeErrorResult {
  type: 'error';
  message: string;
  judgeTime: number;
}
```

## 开发指南

### 前置条件

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker（用于构建镜像）

### 本地开发

```bash
# 安装依赖
pnpm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 启动开发服务器
pnpm dev
```

### 项目结构

```
judge-machine/
├── protocol/                    # JRTP 传输协议
│   ├── index.ts                 # 协议导出
│   └── judge-result-transfer-protocal.ts  # JRTP 实现
├── src/
│   ├── index.ts                 # 应用入口
│   ├── controllers/             # HTTP/WS 控制器
│   ├── events/                  # 事件定义
│   ├── lib/                     # 核心库
│   │   └── system.ts            # 评测系统 API
│   ├── schemas/                 # Zod 数据模式
│   ├── services/                # 业务服务
│   │   ├── judge.ts             # 评测服务
│   │   ├── playwright.ts        # Playwright 服务
│   │   └── event-emitter.ts     # 事件发射器
│   └── utils/                   # 工具函数
├── test/                        # 测试文件
├── Dockerfile                   # Docker 构建文件
├── package.json
└── tsconfig.json
```

### 评测脚本 API

评测脚本在 VM2 沙箱中执行，沙箱只注入两个句柄（`page` 与 `$`），入口必须是
`export default defineTestHandler(...)`（判题机把 `export default ` 文本改写成 `const run = `）：

```typescript
export default defineTestHandler(async ({ page, $ }) => {
   // page: Playwright 的 Page（去掉了 goto，导航由判题机负责）
   //   - 额外提供 page.waitForNetworkIdle({ timeout })，见下
   // $: 评测辅助方法

   $.defineCheckPoint('检查点名称', 10, async () => {
      $.expect(条件, '期望 X，实际 Y'); // 断言失败抛错 → 该检查点 fail
      return 10;                       // 必须 return 本检查点得分，否则记 0 分
   });

   // 快照：audit 模式存图，judge 模式与出题时存下的图比相似度
   await $.saveOrCompare({
      type: 'image',
      buffer: await page.screenshot(),
      name: 'main.png',
   });
});
```

#### `page.waitForNetworkIdle({ timeout })`

等网络静默：在途请求归零并保持 500ms 后 resolve `true`，超时 resolve `false`（不抛错）。

Playwright 自己没有这个能力：`waitForLoadState('networkidle')` 依赖导航期的 lifecycle
事件，页面加载完之后再调用会立即返回，点一次按钮再等就等不到东西。

```js
const idle = page.waitForNetworkIdle({ timeout: 5000 }); // 先挂等待（默认 3000，上限 5000）
await page.click('#load-more');                          // 再触发请求
$.expect(await idle, '点击后 5s 内网络仍未结束');
```

- 只统计**调用之后**发出的请求，所以顺序必须是“先挂等待、再触发动作”。
- `timeout` 上限 5000ms：脚本总预算只有 20s（见 `src/services/judge.ts`），一次等待
  吃掉一半预算，后面的检查点会被硬超时一起作废。
- 超时返回 `false` 而不是抛错，由调用方用 `$.expect` 决定要不要判失败 ——
  脚本级异常会让**所有**检查点一起作废。
- 它只保证“请求已结束”，不代表渲染完成；断言前仍应 `waitForSelector` 等目标元素。

## Docker 部署

### 构建镜像

```bash
# 标准构建
pnpm docker:build

# 使用代理构建（中国大陆用户）
pnpm docker:build:proxy
```

### 镜像信息

- **镜像名称**: `challenge-judge-machine-agent`
- **基础镜像**: `mcr.microsoft.com/playwright:v1.54.1-noble`
- **暴露端口**: 3000
- **工作目录**: `/app`

### 运行容器

```bash
docker run -d \
  --name judge-machine \
  --network orange-network \
  -p 3000:3000 \
  challenge-judge-machine-agent
```

## API 参考

### HTTP 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/link` | WebSocket 升级端点 |

### 服务类

#### PlaywrightService

```typescript
class PlaywrightService {
  // 初始化浏览器池
  async init(instanceCount: number): Promise<void>;

  // 打开新页面
  async openPage(url: string): Promise<{
    context: BrowserContext;
    page: Page;
    close: () => Promise<void>;
  }>;

  // 健康检查
  async healthCheck(browserIndex: number): Promise<boolean>;
}
```

#### JudgeService

```typescript
class JudgeService {
  // 初始化服务
  async init(resourceBaseUrl: string): Promise<void>;

  // 处理评测任务
  async handleTask(options: IEventMessage['MESSAGE']): Promise<void>;
}
```

---

<p align="center">
  <b>Judge Machine Agent</b> - Quanta 前端挑战自动化评测引擎
</p>
