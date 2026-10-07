# 变更记录

本文件按时间倒序记录 `qpc` 的行为变化。格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号沿用语义化版本。

## [Unreleased]

### Removed

- 移除 CLI 直连判题调度器的能力：删除全局参数 `--judge`、环境变量
  `QUANTA_JUDGE_URL` 与 `DEFAULT_JUDGE_URL`、`qpc check --judge`、
  `qpc doctor` 的调度器健康检查，以及 `src/services/judge-api.ts`。
  生产环境下调度器无法从出题人机器直连，而判题脚本归一化（`/code/extract`）
  本就由服务端在 `upload` 时完成，CLI 现在只依赖 Web 应用。

## [0.2.0] - 2026-10-07

### Added

- `qpc login --device`：OAuth 2.0 设备授权流程（RFC 8628）登录。
  申请验证码 → 浏览器授权（页面展示账号/应用/权限并要求显式确认）→ 轮询换 token → 落盘。
  密码不经过 CLI，也不会进 shell history。
- `--no-browser`：只打印验证地址与验证码，便于 SSH / 跳板机 / CI 场景。
- 服务端配套：
  - `POST /api/oauth/device/authorize`、`POST /api/oauth/device/token`；
  - `GET /api/oauth/device/session`、`POST /api/oauth/device/decision`（会话 + CSRF）；
  - 确认页 `app/pages/auth/device`；
  - 端点限速中间件；会话状态存 Redis（多副本部署安全）。
- `@challenge/shared/oauth`：两端共用的协议常量与 `user_code` 归一化函数。
  **两端必须引用同一份实现**，否则会出现"用户输入正确却查不到会话"。

### Security

- `device_code` 为 32 字节随机且**一次性消费**（条件 `del` 保证原子，已有并发测试覆盖）。
- `user_code` 为 base20 × 8 位（约 34.6 bit）；输错 5 次即作废会话（RFC 8628 §5.1）。
- 换到 token 后立即失效；`client_id` 不匹配的请求拿不到会话。
- 批准操作要求登录会话 + CSRF 双提交，且已批准的会话不能被第二个账号改绑。
- 签发前从数据库重新读取角色，避免用授权期间的旧角色签发。

### Notes

- 未实现 loopback 重定向：它无法覆盖 SSH / CI 场景，且需要额外处理端口与
  `127.0.0.1` 指向问题。设备码一种流程即可覆盖全部场景。
- 新增 `vitest.config.ts`：原先没有配置，导致任何 import 服务端源码（Nuxt `~~/` 别名）
  的测试都无法运行。配置里 `include` 刻意逐目录列出，避免顺带纳入一个长期未运行、
  已有 27 个失败的既有 spec（那是独立问题，不该借本次改动变成 CI 红灯）。

## [0.1.0] - 2026-10-07

首个版本：把 `docs/PROBLEM_AUTHORING.md` 的出题流程工具化。

### Added

- `qpc init`：生成题目骨架（`problem.config.ts`、`judge.js`、`template/`、`answer/`、
  `README.md`、`.gitignore`），生成的 judge 脚本与配置**零预检错误、零警告**。
- `qpc check`：离线预检，覆盖判题脚本 return 分数、`page.click` 超时、
  断言消息可读性、`totalScore` 一致性、`initCommand` 与打包目录自洽、
  快照体积/文件数、模板入口页等 24 条规则（见 `docs/RULES.md`）。
  `--judge` 会额外调用调度器 `/code/extract` 做服务端编译验证。
- `qpc upload`：按服务端 `UploadSchema` 构造请求（快照键统一 `/project/...`，
  二进制走 base64），默认轮询审计结果并打印每个检查点的 score/totalScore/details。
- `qpc status <pid>`：查看状态与审计明细，`--watch` 持续刷新。
- `qpc publish <pid>` / `--unpublish`：发布与下架，并在服务端允许的状态外提前拦截。
- `qpc login` / `--show` / `--logout`：凭据存 `~/.config/quanta/credentials.json`（0600），
  access token 过期时自动用 refresh token 续期；支持 `--token` / `QUANTA_TOKEN`（不落盘）。
- `qpc doctor`：自检 Node 版本、凭据权限、API 可达性、登录角色、判题调度器。
- 退出码契约：0 成功、1 运行时错误、2 用法错误、3 预检/审计未通过、
  4 网络或 5xx、5 认证失败、130 中断。
- `--json` 机器可读输出（stdout 仅一份结果 JSON，日志走 stderr）。
- 工程化：biome（lint + format）、tsup（ESM + dts）、vitest（覆盖率阈值 70%）、
  `examples/hello-total` 作为 e2e fixture、CI workflow。

### Notes

- 上传前不做本地 Playwright 预检：真实判题机的执行环境无法在本地等价复现，
  硬凑一套只会带来"本地过了线上挂了"的虚假安全感。线上审计的结果由
  `qpc upload --wait` 完整拉回，本地只负责静态可判定的部分。
