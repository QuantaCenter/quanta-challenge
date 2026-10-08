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

RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

# 复制根 workspace 清单与锁文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制依赖到的 workspace 包的 package.json。
# ⚠️ 目标路径必须与 pnpm-workspace.yaml / pnpm-lock.yaml 的 importer 键完全一致。
COPY packages/challenge-cloud-function/package.json ./packages/challenge-cloud-function/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm config set registry ${NPM_REGISTRY}
RUN npm install pnpm@9.15.9 -g --verbose

RUN pnpm install --frozen-lockfile

# 保险：确保 prisma CLI 就绪（pnpm 不同版本对依赖构建脚本策略不同）
RUN pnpm rebuild prisma @prisma/client

# 复制源码
COPY packages/challenge-cloud-function ./packages/challenge-cloud-function
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared

# 生成 Prisma 客户端
WORKDIR /app/packages/database
RUN pnpm prisma:generate

# 构建云函数服务
WORKDIR /app/packages/challenge-cloud-function
RUN pnpm build

# 运行期生产模式（必须在依赖安装与 prisma 生成之后，原因见 judge-scheduler/Dockerfile）
ENV NODE_ENV=production

# 迁移数据库 -> 启动服务
CMD ["sh", "-c", "cd /app/packages/database && pnpm run prisma:migrate:deploy && cd /app/packages/challenge-cloud-function && pnpm run start"]
