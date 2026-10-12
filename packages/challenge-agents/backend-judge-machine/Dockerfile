FROM node:24-slim

ARG APT_MIRROR=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"

RUN if [ -n "$APT_MIRROR" ]; then \
       sed -i "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list.d/debian.sources; \
    fi && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN npm config set registry ${NPM_REGISTRY} && npm install -g pnpm@9.15.9

COPY . /app
WORKDIR /app

ENV CI=true
RUN pnpm install --force --filter @challenge/backend-judge-machine-agent...
RUN pnpm --filter @challenge/backend-judge-machine-agent build

CMD ["node", "packages/challenge-agents/backend-judge-machine/dist/index.js"]

EXPOSE 3000
