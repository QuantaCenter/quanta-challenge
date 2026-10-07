FROM node:24-slim

# 声明代理参数
ARG http_proxy
ARG https_proxy
ENV HTTP_PROXY=${http_proxy}
ENV HTTPS_PROXY=${https_proxy}

# 镜像源可覆盖：默认走官方源，在受限网络下用 --build-arg APT_MIRROR=mirrors.ustc.edu.cn 等切换，
# 避免把某一地区的镜像写死进构建脚本。
ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"

WORKDIR /app

# 安装 openssl 与 node-gyp 所需的编译工具链。
#
# 额外装 tzdata：基础镜像 node:24-slim 默认没有 zoneinfo，不装的话下面
# `ENV TZ=Asia/Shanghai` 无法解析，Node 会静默退回 UTC。
# DEBIAN_FRONTEND=noninteractive 避免 tzdata 安装时弹交互式地区选择而卡住构建。
RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y openssl libssl3 python3 make g++ tzdata && rm -rf /var/lib/apt/lists/*

# 业务时区。
#
# 容器默认是 UTC，而 SSR 会用「容器本地时区」执行组件里的 `new Date()` /
# `dayjs()`（问候语、日历今日高亮等）。钉死成业务时区后，SSR 与水合后
# （用户多为 CST）的判断才一致，日志时间戳也符合团队习惯。
# 注意：每日一题的业务日期仍由 server/utils/daily-date.ts 显式 .tz() 计算，
# 不依赖这个环境变量，此处只是兜底统一全部本地时间语义。
ENV TZ=Asia/Shanghai

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制所有包的 package.json。
#
# ⚠️ 目标路径必须与 pnpm-workspace.yaml 的 glob 及 pnpm-lock.yaml 的 importer 键完全一致。
# 原先复制到 packages/web、packages/judge-machine 这类短路径，pnpm 因此认不出这些
# workspace 包（packages/* 匹配不到 packages/challenge-agents/judge-machine，
# packages/web 也不等于 packages/challenge-web-app），直接以
# ERR_PNPM_OUTDATED_LOCKFILE 失败 —— 该镜像从未能构建成功。
COPY packages/challenge-web-app/package.json ./packages/challenge-web-app/package.json
COPY packages/challenge-agents/judge-machine/package.json ./packages/challenge-agents/judge-machine/package.json
COPY packages/challenge-agents/live-server/package.json ./packages/challenge-agents/live-server/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# 安装 pnpm (固定 v9 版本，避免 v10 默认忽略构建脚本导致安装失败)
RUN npm config set registry ${NPM_REGISTRY}
RUN npm install pnpm@9.15.9 -g --verbose

# 安装依赖（严格遵循 pnpm-lock.yaml）
RUN pnpm install --frozen-lockfile

# 复制源代码（同样保持真实路径）
COPY packages/challenge-web-app ./packages/challenge-web-app
COPY packages/challenge-agents/judge-machine ./packages/challenge-agents/judge-machine
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared

# 必须先执行 nuxt prepare。
#
# 本包的 postinstall 就是 `nuxt prepare`，但它在上面的 pnpm install 阶段运行时
# 源码还没被复制进来，等于空跑；而 nuxt build 依赖 prepare 生成的 .nuxt 目录
# （其中包含 #components 等虚拟模块的解析信息）。缺少这一步会以
#   [vite]: Rollup failed to resolve import "#components"
# 直接失败。此处源码已就位，显式补跑一次。
#
# 注意用本包已安装的 nuxt（pnpm exec），不要用 `npx nuxi`：npx 会去网络拉一份
# 临时 nuxi，其模块解析上下文指向临时目录，会报找不到 nuxt。
WORKDIR /app/packages/challenge-web-app
RUN pnpm exec nuxi prepare

# 构建应用
RUN pnpm build

# 生成 Prisma 客户端
WORKDIR /app/packages/database
RUN pnpm prisma:generate

# 运行期设为生产模式。
#
# ⚠️ 必须放在依赖安装与 prisma 生成之后：NODE_ENV=production 会让 pnpm 跳过
# devDependencies，而 prisma:generate 的第二步依赖 devDependency
# @loancrate/prisma-schema-parser。
ENV NODE_ENV=production

# 运行数据库种子脚本，然后启动应用。
#
# ⚠️ 迁移也在这里跑（脚本第一步）。原因：调度器容器虽然也会跑 migrate deploy，
# 但两个容器是同时起的（compose 的 depends_on 是 list 形式，只等容器启动），
# web 可能在 schema 还是旧版本时就开始服务请求。`migrate deploy` 幂等且带
# advisory lock，两边同时跑是安全的。完整说明见 scripts/docker-entrypoint.sh。
WORKDIR /app/packages/challenge-web-app
CMD ["sh", "/app/packages/challenge-web-app/scripts/docker-entrypoint.sh"]
