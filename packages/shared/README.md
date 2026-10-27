# @challenge/shared

Quanta Challenge 各服务共享的工具库与协议实现。只提供纯函数与配置，不含业务流程；被 Web 应用、评测调度器、云函数、判题机等包依赖。

## 导出

通过 package.json `exports` 按子路径导入：

| 子路径 | 内容 |
|--------|------|
| `@challenge/shared` 之外的下列路径均按需导入 | |
| `./store` | 共享存储服务 |
| `./thumbhash/server` / `./thumbhash/client` / `./thumbhash/data-url` | 缩略图 hash（判题首屏截图 → 列表占位图） |
| `./utils` | URL 处理工具（`url` 等） |
| `./utils/local-store-path` | local_store 目录路径约定（调度器与 Web 应用共享卷） |
| `./utils/repo-root` | 仓库根目录定位 |
| `./config` | 搜索等共享配置（`search-config.ts`） |
| `./backend-service-image` | 后端题型容器镜像注册表（如 `node-24`）与启动命令构造（`buildBackendInitCommand`）；新增镜像要在此登记 |
| `./openapi` | 调度器 → Web 应用回调的 HMAC 签名（`generateOpenApiSign`，配 `OPENAPI_WEBHOOK_SECRET`） |
| `./cloud-function` | 云函数内部调用的请求签名 |
| `./oauth` | OAuth 2.0 设备授权流程（RFC 8628）共享类型与常量（`qpc` 与 Web 应用两端共用） |

## 使用约定

- 源码直接以 `.ts` 导出（依赖各服务的打包器处理），无独立构建产物
- 两端共用的协议常量（签名密钥名、cookie 名、就绪信号等）必须放在这里，避免双方硬编码后漂移
- 改动签名 / 协议相关代码时，注意同时影响 web-app 与 judge-scheduler 两端
