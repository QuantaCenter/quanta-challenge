FROM node:24-slim

# 声明代理参数
ARG http_proxy
ARG https_proxy
ENV HTTP_PROXY=${http_proxy}
ENV HTTPS_PROXY=${https_proxy}

# 镜像源可覆盖，默认走官方源
ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"

WORKDIR /app

# 安装 openssl 与 node-gyp 所需的编译工具链（ssh2 需要）
RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && apt-get install -y openssl libssl3 python3 make g++ && rm -rf /var/lib/apt/lists/*

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制所有包的 package.json。
#
# ⚠️ 目标路径必须与 pnpm-workspace.yaml 的 glob 以及 pnpm-lock.yaml 里的 importer 键
# **完全一致**（即 packages/challenge-judge-scheduler、packages/challenge-agents/judge-machine）。
# 原先这里复制到 packages/scheduler、packages/judge-machine，看似更短更整洁，但 pnpm 会
# 因此认不出这些 workspace 包：pnpm-workspace.yaml 的 `packages/*` 匹配不到
# `packages/challenge-agents/judge-machine`，而 `packages/scheduler` 也不等于
# `packages/challenge-judge-scheduler`。结果是 pnpm 认为 lockfile 里这些包没有 specifier，
# 直接以 ERR_PNPM_OUTDATED_LOCKFILE 失败 —— 该镜像从未能构建成功。
COPY packages/challenge-judge-scheduler/package.json ./packages/challenge-judge-scheduler/package.json
COPY packages/challenge-agents/judge-machine/package.json ./packages/challenge-agents/judge-machine/package.json
COPY packages/challenge-agents/live-server/package.json ./packages/challenge-agents/live-server/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/challenge-observation/package.json ./packages/challenge-observation/package.json

# 安装 pnpm (固定 v9 版本，避免 v10 默认忽略构建脚本导致安装失败)
RUN npm config set registry ${NPM_REGISTRY}
RUN npm install pnpm@9.15.9 -g --verbose

# 安装依赖（严格遵循 pnpm-lock.yaml）
RUN pnpm install --frozen-lockfile

# 确保 prisma CLI 一定就绪（幂等，重复执行无副作用）。
#
# 权当保险：prisma 的 CLI（build/index.js）由依赖的 preinstall/postinstall 生成，
# 而 pnpm 对依赖构建脚本的执行策略在不同版本下会变。显式 rebuild 一次可以避免
# 因策略差异导致的
#   Cannot find module '.../node_modules/prisma/build/index.js'
RUN pnpm rebuild prisma @prisma/client

# 复制源代码（同样保持真实路径）
COPY packages/challenge-judge-scheduler ./packages/challenge-judge-scheduler
COPY packages/challenge-agents/judge-machine ./packages/challenge-agents/judge-machine
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY packages/challenge-observation ./packages/challenge-observation

# 生成 Prisma 客户端
WORKDIR /app/packages/database
RUN pnpm prisma:generate

# 构建调度器。必须用 --filter 限定：
# 本镜像没有 web 应用的源码，无过滤地 pnpm build 会尝试构建所有 workspace 包并失败。
WORKDIR /app/packages/challenge-judge-scheduler
RUN pnpm build

# 运行期设为生产模式。
#
# ⚠️ 这一行必须放在依赖安装与 prisma 生成**之后**。
# NODE_ENV=production 会让 pnpm 跳过 devDependencies，而 prisma:generate 的第二步
# （packages/database/prisma/name-map/generate-script.mjs）依赖 devDependency
# @loancrate/prisma-schema-parser。提前设置会以
#   Cannot find package '@loancrate/prisma-schema-parser'
# 失败。（调度器自身只在 NODE_ENV=production 时才监听 1888 端口，所以运行期必须为 production。）
ENV NODE_ENV=production

# 迁移数据库 -> 启动服务
CMD ["sh", "-c", "cd /app/packages/database && pnpm run prisma:migrate:deploy && cd /app/packages/challenge-judge-scheduler && pnpm run start"]
