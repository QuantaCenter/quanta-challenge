 Quanta Challenge 本地部署问题总结

  一、Docker 构建问题

  1. Dockerfile 缺少 Python/编译工具 — node:24-slim 不含 Python，ssh2 的 node-gyp 编译失败。解决方法：apt-get install 加
  python3 make g++
  2. Debian 源 502 — deb.debian.org 国内无法访问。解决：sed 替换为 mirrors.ustc.edu.cn
  3. MCR Playwright 镜像不可达 — mcr.microsoft.com/playwright 国内 TLS 握手超时。解决：改 ubuntu:22.04 基础镜像，手动装
  Node.js + Playwright
  4. pnpm 交互式确认弹窗 — Docker 非 TTY 环境下 pnpm 弹 Proceed? (Y/n) 卡住。解决：CI=true pnpm install --force
  5. Dockerfile 命令路径错误 — pnpm run build / pnpm start 在 monorepo 根目录不存在。解决：--filter
  @challenge/judge-machine-agent + 指定 dist/index.js 路径
  6. 根目录缺少 .dockerignore — 构建上下文包含 node_modules 等大文件。解决：创建根 .dockerignore

  ---
  二、调度器 Bug

  7. dotenv 加载时机错误 — dotenv.config() 在 Hono middleware 中延迟执行，但 startApp() 初始化服务在前，导致 REDIS_PORT
  未生效，默认连 6379 超时。解决：在 index.ts 顶部补 dotenv.config()
  8. BullMQ Queue 未传 Redis 连接 — new Queue(name) 不传 connection，默认连 localhost:6379，无视 RedisService
  配置。解决：改为 new Queue(name, { connection: this.redis })
  9. ws 包 message 类型不兼容 — 浏览器 WebSocket 的 event.data 是 Blob，Node.js 的 ws 包返回
  Buffer，eventData.arrayBuffer() 报错。解决：Buffer.isBuffer() 判断兼容处理
  10. host.docker.internal 宿主机不可解析 — 调度器在宿主机运行，host.docker.internal 只在容器内有效。解决：改为
  localhost:1889
  11. Prisma ESM 导入兼容 — prismaClient.default 在 Vite SSR 下失效，result-handler.ts 报 Cannot read properties of
  undefined。解决：改为直接 import prisma from '@challenge/database'

  ---
  三、前端运行时问题

  12. Promise.withResolvers 不兼容 — Node 22+ API，用户的 Node 20 不支持。解决：手动实现 new Promise + 外部 resolve
  13. WebContainer boot 命令阻塞提交 — npx serve -l 3000 长驻进程不退出，process.exit 永久等待，hasProjectInitialized
  永远 false，提交按钮禁用。解决：启动命令留空，改用初始化命令跑 shell
  14. 预览显示目录列表 — serve 从 workspace 根目录启动，文件在 /project/ 子目录。解决：npx serve -l 3000 project
  15. NODE_OPTIONS 语法 Windows 不兼容 — 单引号赋值语法在 cmd 中报错。需用 set 或者干脆不加（16GB 内存够用）
  16. 僵尸进程占端口 — 多次 taskkill 残留 Node 进程，新实例监听成功但不响应，curl 超时。解决：netstat -ano | findstr
  :3000 + 手动 taskkill /PID

  ---
  四、Docker 数据迁移

  17. VHDX 文件被 Hyper-V 锁定 — CLI 无法 move/delete。解决：复制到 D 盘 → Docker Desktop GUI → Settings → Resources →
  Advanced → Disk image location → 改路径 → Apply & Restart → 删除 C 盘旧文件