FROM node:24-slim

ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"

# ---------------------------------------------------------------------------
# 后端判题机镜像。
#
# 与 challenge-judge-machine-agent 的关键差异：**不装 Playwright / 不装 Chromium**。
# 后端题型只用 HTTP 客户端 + VM2 沙箱，镜像因此小得多、构建也快得多
# （前端镜像要 `playwright install-deps chromium`，是构建时间的大头）。
# ---------------------------------------------------------------------------
RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm config set registry ${NPM_REGISTRY} && npm install -g pnpm@9.15.9

# COPY 整仓上下文（.dockerignore 已排除 node_modules / dist / .git）。
# 与 judge-machine 同样的理由：pnpm 会校验 lockfile 里所有 workspace importer，
# 只挑着 COPY 几个 package.json 极易 ERR_PNPM_OUTDATED_LOCKFILE。
COPY . /app
WORKDIR /app

# 只安装本判题机自身的依赖闭包，避免触发 web 应用的 postinstall（nuxt prepare）。
ENV CI=true
RUN pnpm install --force --filter @challenge/backend-judge-machine-agent...
RUN pnpm --filter @challenge/backend-judge-machine-agent build

CMD ["node", "packages/challenge-agents/backend-judge-machine/dist/index.js"]

EXPOSE 3000
