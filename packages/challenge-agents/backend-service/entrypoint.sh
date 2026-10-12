#!/bin/sh
set -eu

APP_DIR="${QUANTA_APP_DIR:-/app/project}"
STORE_DIR="${QUANTA_STORE_DIR:-/pnpm-store}"
PORT="${QUANTA_PORT:-3000}"
START_COMMAND="${QUANTA_START_COMMAND:-}"
READY_TIMEOUT="${QUANTA_READY_TIMEOUT:-60}"
# 启动命令的工作目录。
#
# 默认是快照挂载根 /app，而不是 APP_DIR：题目作者写的启动命令与编辑器里的
# initCommand 是**同一条**（例如 `cd ./project && node server.js`），它相对
# WebContainer 根目录；若在 /app/project 里执行就会变成 /app/project/project。
# 因此约定：依赖装在 APP_DIR，启动命令在 WORK_DIR 执行。
WORK_DIR="${QUANTA_WORK_DIR:-/app}"

log() {
   echo "[quanta] $*"
}

if [ ! -d "$APP_DIR" ]; then
   log "题目目录不存在：$APP_DIR" >&2
   exit 1
fi

cd "$APP_DIR"

if [ -f pnpm-lock.yaml ]; then
   log "离线安装依赖（store=$STORE_DIR）..."
   if ! pnpm install --offline --frozen-lockfile --store-dir "$STORE_DIR"; then
      log "离线安装失败：缓存未预热或与当前镜像不匹配。" >&2
      log "请在调度器上执行 POST /cache/update（project=该快照, image=本镜像）后重试。" >&2
      exit 1
   fi
else
   log "未找到 pnpm-lock.yaml（$APP_DIR），跳过依赖安装。"
fi

if [ -z "$START_COMMAND" ]; then
   log "QUANTA_START_COMMAND 为空，不知道该启动什么。" >&2
   exit 1
fi

log "启动服务（cwd=$WORK_DIR）：$START_COMMAND"
cd "$WORK_DIR"
# 用 sh -c 跑题目的启动命令，使其支持管道 / && 等 shell 语法。
sh -c "$START_COMMAND" &
SERVICE_PID=$!

# 服务进程提前退出时，别让容器一直挂着等端口。
trap 'log "收到退出信号，停止服务"; kill "$SERVICE_PID" 2>/dev/null || true' INT TERM

# 端口就绪探测。
# 必须自己做：用户的服务（node dist/index.js 等）不会打印 Ready，
# 若直接 exec 用户命令，调度器永远收不到 Ready，只能等超时。
log "等待端口 $PORT 就绪（上限 ${READY_TIMEOUT}s）..."
if ! node -e '
const net = require("net");
const port = Number(process.env.QUANTA_PORT || 3000);
const timeoutMs = Number(process.env.QUANTA_READY_TIMEOUT || 60) * 1000;
const deadline = Date.now() + timeoutMs;
const retry = () => {
   const socket = net.connect({ host: "127.0.0.1", port });
   socket.once("connect", () => { socket.end(); process.exit(0); });
   socket.once("error", () => {
      socket.destroy();
      if (Date.now() > deadline) {
         console.error(`[quanta] 服务在 ${timeoutMs / 1000}s 内未监听端口 ${port}`);
         process.exit(1);
      }
      setTimeout(retry, 300);
   });
};
retry();
'; then
   # 端口没起来，把服务进程也带走，避免留下半个容器
   kill "$SERVICE_PID" 2>/dev/null || true
   exit 1
fi

# 这一行是调度器的就绪信号，格式不要改（docker.ts 里按 "Ready" 匹配）。
log "Ready"

# 前台 wait：容器生命周期跟随服务进程。
wait "$SERVICE_PID"
