#!/usr/bin/env bash
# 初始化监控栈数据目录并修正容器运行用户属主
# macOS Docker Desktop 上 chown 可能不生效（自动忽略），Linux VPS 上必须执行一次
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../deploy" && pwd)"

mkdir -p "$DEPLOY_DIR"/data/{prometheus,loki,grafana,alloy,observation,data-mcp}

chown -R 65534:65534 "$DEPLOY_DIR/data/prometheus" 2>/dev/null || true # prometheus (nobody)
chown -R 10001:10001 "$DEPLOY_DIR/data/loki" 2>/dev/null || true       # loki
chown -R 472:472 "$DEPLOY_DIR/data/grafana" 2>/dev/null || true        # grafana
chown -R 1000:1000 "$DEPLOY_DIR/data/observation" 2>/dev/null || true  # node (Dockerfile 内 USER node)
chown -R 1000:1000 "$DEPLOY_DIR/data/data-mcp" 2>/dev/null || true     # data-mcp (Node USER node)

echo "==> data 目录就绪: $DEPLOY_DIR/data"
