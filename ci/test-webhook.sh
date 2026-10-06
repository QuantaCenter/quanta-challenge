#!/usr/bin/env bash
# 本地联调：用 CI 侧的真实脚本（scripts/ci/notify-deploy.mjs）打一次 webhook，验证签名-幂等-部署链路。
# 用法：
#   sudo bash ci/test-webhook.sh                 # 用当前 HEAD 的 commit + 假 digest（验证失败/回滚路径，不动容器）
#   sudo bash ci/test-webhook.sh --skipped       # 用已部署的 commit 打一次，应返回 already deployed
#   sudo bash ci/test-webhook.sh --bad-sig       # 错误签名，应返回 403
set -euo pipefail
CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$CI_DIR")"
SECRET_FILE=${SECRET_FILE:-/www/qc-secrets/deploy-webhook.env}
URL=${URL:-http://127.0.0.1:19000/hooks/images}
SECRET=$(sed -n 's/^DEPLOY_WEBHOOK_SECRET=//p' "$SECRET_FILE")
STATE=${STATE_FILE:-/var/lib/quanta-deploy/state.json}

# 部署机上的检出可能落后于 CI 脚本出现的版本，这里多找几个位置
NOTIFY=""
for p in "$REPO_DIR/scripts/ci/notify-deploy.mjs" "$PWD/scripts/ci/notify-deploy.mjs" /home/ubuntu/quanta-challenge/scripts/ci/notify-deploy.mjs; do
  [ -f "$p" ] && { NOTIFY=$p; break; }
done
[ -n "$NOTIFY" ] || { echo "找不到 scripts/ci/notify-deploy.mjs，请先 git pull 或指定 CI_SCRIPTS"; exit 1; }

if [ "${1:-}" = "--bad-sig" ]; then
  TS=$(date +%s)
  BODY='{"event":"images.published","delivery":"bad","commit":"deadbeef","tag":"sha-bad","images":[]}'
  curl -s -o /dev/null -w "错误签名 -> HTTP %{http_code}（期望 403）\n" -X POST "$URL" \
    -H 'Content-Type: application/json' -H "X-Quanta-Timestamp: $TS" \
    -H "X-Quanta-Signature: sha256=0000" -H 'X-Quanta-Event: images.published' -d "$BODY"
  exit 0
fi

if [ "${1:-}" = "--skipped" ]; then
  SHA=$(sed -n 's/.*"commit": *"\([^"]*\)".*/\1/p' "$STATE" | head -1)
  TAG=$(sed -n 's/.*"tag": *"\([^"]*\)".*/\1/p' "$STATE" | head -1)
  echo "用已部署的 commit=$SHA tag=$TAG 重放，期望 200 already deployed"
  IMAGES="web-app|ghcr.io/quantacenter/quanta-challenge-web-app|sha256:$(printf '0%.0s' {1..64})"
else
  SHA=${SHA:-$(git -C "$REPO_DIR" rev-parse HEAD)}
  TAG=${TAG:-sha-test000}
  # 假 digest：必然拉取失败，用来验证「失败 → 回滚」不会误伤在跑的容器
  IMAGES=${IMAGES:-"web-app|ghcr.io/quantacenter/quanta-challenge-web-app|sha256:$(printf '0%.0s' {1..64})"}
fi

printf '%s\n' "$IMAGES" > /tmp/test-images.txt
ENV_ARGS=(
  "WEBHOOK_URL=$URL" "WEBHOOK_SECRET=$SECRET" "GITHUB_SHA=$SHA"
  "GITHUB_REPOSITORY=QuantaCenter/quanta-challenge" "GITHUB_REF=refs/heads/main" "GITHUB_ACTOR=local-test"
)
env "${ENV_ARGS[@]}" node "$NOTIFY" --images-file /tmp/test-images.txt --tag "$TAG"
echo "--- 之后看：journalctl -u quanta-deploy-webhook -n 30 / tail -20 /var/log/quanta-deploy-webhook.log ---"
