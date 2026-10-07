#!/usr/bin/env sh
#
# Web 容器启动入口：迁移数据库 → 写入种子 → 启动应用。
#
# 为什么迁移放在这里（而不是只放在判题调度器容器里）：
# 两个容器是同时起来的 —— compose 的 depends_on 是 list 形式，只等容器「启动」，
# 不等任何健康条件。原先的启动顺序下，web 可能在 schema 还是旧版本时就开始服务请求：
# 加一列这类瞬时 DDL 窗口很小，但建索引/回填这类重活会变成真实的 500 窗口。
# `prisma migrate deploy` 自带 advisory lock、幂等，两个容器同时跑是安全的，
# 因此改成「谁先起谁先迁移」。调度器容器的那一份保持不变（见其 Dockerfile）。
#
# 失败重试是有限的：冷启动时 postgres 可能还没就绪（这类失败重试即可恢复），
# 但真正的迁移错误必须在有限次之后退出，让部署流程（健康检查 → 回滚）看到失败，
# 而不是无限重试、假装容器还在正常启动。
set -e

DATABASE_DIR=/app/packages/database
APP_DIR=/app/packages/challenge-web-app
MAX_ATTEMPTS=5
RETRY_INTERVAL=5

cd "$DATABASE_DIR"

attempt=0
until pnpm run prisma:migrate:deploy; do
   attempt=$((attempt + 1))
   if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      echo "[entrypoint] prisma migrate deploy 重试 ${MAX_ATTEMPTS} 次仍失败，退出"
      exit 1
   fi
   echo "[entrypoint] prisma migrate deploy 第 ${attempt} 次失败，${RETRY_INTERVAL} 秒后重试"
   sleep "$RETRY_INTERVAL"
done

echo "[entrypoint] 数据库迁移完成"

cd "$APP_DIR"
node scripts/prisma-seed.ts

# exec：让 node 直接接管 PID 1，容器收到的 SIGTERM 才不会被 sh 吞掉
exec node .output/server/index.mjs
