FROM ubuntu:22.04

# 镜像源可覆盖（默认走官方源；受限网络下用 --build-arg APT_MIRROR=mirrors.aliyun.com）
ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"
# Node.js 版本：必须以 v 开头的完整版本号
ARG NODE_VERSION="v22.23.1"

RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/archive.ubuntu.com/$APT_MIRROR/g" /etc/apt/sources.list && \
       sed -i "s/security.ubuntu.com/$APT_MIRROR/g" /etc/apt/sources.list; \
    fi

# ---------------------------------------------------------------------------
# 安装 Node.js
#
# 这里刻意不使用 NodeSource 的 setup_22.x 脚本。该脚本依赖 apt 安装 nodejs，
# 一旦 apt 源出现 502 / 未签名等故障（archive.ubuntu.com 在国内网络下经常如此），
# 脚本会「静默回退」到发行版自带的 Node 12 —— 而且不带 npm，
# 于是构建在后面某一步才以 "npm: not found" 这种难以定位的方式失败。
# 直接从官方分发站下载二进制包可以绕开 apt 源，并且能立即校验版本是否匹配。
# ---------------------------------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates xz-utils && \
    rm -rf /var/lib/apt/lists/* && \
    ARCH="$(dpkg --print-architecture)" && \
    case "$ARCH" in \
      amd64) NODE_ARCH="linux-x64" ;; \
      arm64) NODE_ARCH="linux-arm64" ;; \
      *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;; \
    esac && \
    curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md && \
    rm -f /tmp/node.tar.xz && \
    node -v && npm -v

# 配置 npm 镜像源
RUN npm config set registry ${NPM_REGISTRY}

# 安装 Playwright 系统依赖（通过 npm 的 playwright 包）
# 版本与 package.json 中的 playwright 依赖保持一致
RUN npm install -g playwright@1.54.1 && \
    npx playwright install-deps chromium && \
    npx playwright install chromium

# 安装 pnpm
RUN npm install -g pnpm@9.15.9

# COPY local files exclude node_modules and .git
COPY . /app
WORKDIR /app

# 安装依赖并构建（跳过 Playwright 浏览器下载，已全局安装）
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# 只安装判题机自身及其依赖闭包。
#
# ⚠️ 原先这里是全量 `pnpm install --force`，在本仓库当前状态下**必然构建失败**：
# 该镜像是 `COPY . /app`（整仓上下文），pnpm 会一并安装 workspace 内的
# packages/challenge-web-app，从而触发它的 postinstall（`nuxt prepare`）；
# 而 nuxi prepare 会把 NODE_ENV 视作 production，使 nuxt.config.ts 中的
# envSecret() 因缺少 ACCESS_TOKEN_SECRET / REFRESH_TOKEN_SECRET 直接抛错：
#   [配置错误] 生产环境必须设置 ACCESS_TOKEN_SECRET
# 判题机本体不依赖任何 workspace 包，因此用 --filter 限定安装范围即可绕开，
# 同时显著减小镜像体积、缩短构建时间。
RUN CI=true pnpm install --force --filter @challenge/judge-machine-agent...
RUN pnpm --filter @challenge/judge-machine-agent build

CMD ["node", "packages/challenge-agents/judge-machine/dist/index.js"]

EXPOSE 3000
