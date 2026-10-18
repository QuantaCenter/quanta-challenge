#!/usr/bin/env node
/**
 * 部署机侧 webhook：CI 推完镜像后由 GitHub Actions 调用，
 * 拉镜像 → 重启对应容器 → 失败回滚到上一个可用版本。
 *
 * 契约：docs/IMAGE_WEBHOOK.md（签名、幂等、状态码）。
 * 无第三方依赖，Node >= 20。
 *
 * 超时：拉取的静默上限是 8 分钟（PULL_IDLE_MS）——judge-machine 这类 2.46GB 镜像冷拉时
 *       实测会出现 40s+ 完全无输出，原来统一按 20s 判会被误杀；
 *       其余等待（HTTP 收发、健康探测、compose up）仍为 20s（IDLE_MS）。
 *
 * 部署同步执行：成功回 200，失败（含已回滚 / 回滚失败）回 5xx，调用方据此判定发布是否真正生效。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, appendFileSync, chmodSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';

const IDLE_MS = 20_000; // 普通操作（inspect/tag/compose up/健康探测/HTTP 收发）的静默上限
const PULL_IDLE_MS = 8 * 60_000; // docker pull 的静默上限：大镜像冷拉会长时间无输出，给足 8 分钟
const KEEPALIVE_MS = 60_000; // TCP keepalive 探测间隔：回包前的长静默不能被中间 NAT 按空闲回收
const SKEW_S = 300; // 时间戳窗口（防重放，非超时）
const MAX_BODY = 1 << 20;

const env = process.env;
const CFG = {
   host: env.HOST || '127.0.0.1',
   port: Number(env.PORT || 19000),
   secret: env.DEPLOY_WEBHOOK_SECRET || '',
   repoDir: env.REPO_DIR || '/www/quanta-challenge',
   composeBase: env.COMPOSE_BASE || 'docker/docker-compose.yaml',
   composeOverride: env.COMPOSE_OVERRIDE || 'docker/docker-compose.override.yaml',
   envFile: env.ENV_FILE || '/www/qc-secrets/prod.env',
   stateFile: env.STATE_FILE || '/var/lib/quanta-deploy/state.json',
   logFile: env.LOG_FILE || '/var/log/quanta-deploy-webhook.log',
   // ghcr.io 本机直连不可用（约 0.01 MiB/s），按序回退（部署机实测 dockerproxy 成功率更高，放前面）
   mirrors: (env.GHCR_MIRRORS || 'ghcr.dockerproxy.net,ghcr.nju.edu.cn').split(',').map((s) => s.trim()).filter(Boolean),
   alertUrl: env.ALERT_WEBHOOK_URL || '',
};

// 由 compose 管理的服务：ref 走 compose 变量（web-app）或原样重打标签（调度器无 image:，只能换标签）
const SERVICES = {
   'challenge-web-app': { refVar: 'WEB_APP_REF', health: env.HEALTH_WEB_APP || 'http://127.0.0.1:3000/', codes: [200, 302, 401, 403] },
   'challenge-judge-scheduler': { refVar: '', health: env.HEALTH_JUDGE_SCHEDULER || 'http://127.0.0.1:1888/health', codes: [200] },
   // 云函数服务与调度器同理：compose 里没有 image:，按正在用的标签重打。
   // 健康检查端点由服务自己提供（/healthz 不验签，会实际 ping Redis 与 Postgres，
   // 依赖不可用时返回 503）；它的容器启动时先跑 prisma migrate deploy，
   // 因此健康探测窗口给到 60s，不能用默认的 20s。
   'challenge-cloud-function': {
      refVar: '',
      health: env.HEALTH_CLOUD_FUNCTION || 'http://127.0.0.1:1890/healthz',
      codes: [200],
      healthDeadlineMs: 60_000,
   },
   // 监控栈自研采集服务：独立 compose 项目（packages/challenge-observation/deploy），
   // 不能和业务栈混在同一条 compose 命令里（项目目录/env/网络都不同）。
   // 镜像在 compose 里写作本地名 challenge-observation:latest，部署前把发布镜像重打到该标签。
   observation: {
      refVar: '',
      ref: 'challenge-observation:latest',
      composeFile: 'packages/challenge-observation/deploy/docker-compose.yml',
      envFile: 'packages/challenge-observation/deploy/.env',
      health: env.HEALTH_OBSERVATION || 'http://127.0.0.1:9310/healthz',
      codes: [200],
   },
};

/**
 * `service` 为 null 的镜像不在 compose 里，但调度器是按【本地镜像名:latest】拉容器的
 * （docker.ts 里写 `Image: 'challenge-live-server-agent'`，docker 会补 `:latest`）。
 * 这些本地名必须由 webhook 维护，不能靠人工 docker tag。
 */
const LOCAL_IMAGE_NAMES = {
   'judge-machine': 'challenge-judge-machine-agent',
   'live-server': 'challenge-live-server-agent',
   'backend-service': 'challenge-backend-service-agent',
   'backend-judge-machine': 'challenge-backend-judge-machine-agent',
};

const log = (msg) => {
   const line = `${new Date().toISOString()} ${msg}`;
   console.log(line);
   try {
      appendFileSync(CFG.logFile, line + '\n');
   } catch {}
};

const sh = (cmd, args, { idleMs = IDLE_MS, env: extra } = {}) =>
   new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { env: { ...process.env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timer;
      const arm = () => {
         clearTimeout(timer);
         timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${cmd} ${args.slice(0, 3).join(' ')} 静默超过 ${idleMs}ms`));
         }, idleMs);
      };
      arm();
      child.stdout.on('data', (d) => { stdout += d; arm(); });
      child.stderr.on('data', (d) => { stderr += d; arm(); });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
         clearTimeout(timer);
         code === 0 ? resolve(stdout.trim()) : reject(new Error(`${cmd} ${args.slice(0, 3).join(' ')} 退出码 ${code}: ${(stderr || stdout).trim().slice(-500)}`));
      });
   });

const docker = (args, opts) => sh('docker', args, opts);
const composeArgs = ['compose', '-f', CFG.composeBase, '-f', CFG.composeOverride, '--env-file', CFG.envFile];

const readState = () => (existsSync(CFG.stateFile) ? JSON.parse(readFileSync(CFG.stateFile, 'utf8')) : {});
const writeState = (state) => {
   mkdirSync(dirname(CFG.stateFile), { recursive: true });
   const tmp = `${CFG.stateFile}.tmp`;
   writeFileSync(tmp, JSON.stringify(state, null, 2));
   renameSync(tmp, CFG.stateFile);
};

// 把当前部署的镜像引用写回 compose env 文件，避免 deploy.sh 手动 up 时回退到旧版本
const upsertEnvVar = (file, key, value) => {
   const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
   const next = lines.filter((l) => !l.startsWith(`${key}=`));
   while (next.length && next[next.length - 1] === '') next.pop();
   next.push(`${key}=${value}`, '');
   copyFileSync(file, `${file}.bak`);
   const tmp = `${file}.tmp`;
   writeFileSync(tmp, next.join('\n'));
   chmodSync(tmp, 0o600);
   renameSync(tmp, file);
};

const mirrorRef = (image, digest, host) => `${image.replace(/^ghcr\.io\//, `${host}/`)}@${digest}`;

/** 按 digest 从国内镜像源拉取（digest 即内容寻址，镜像源无法投毒），返回本地镜像 ID */
const pullByDigest = async ({ image, digest, name }) => {
   const sources = CFG.mirrors.map((h) => mirrorRef(image, digest, h));
   if (!image.startsWith('ghcr.io/')) sources.push(`${image}@${digest}`); // 非 ghcr 镜像直连
   for (const ref of sources) {
      try {
         await docker(['pull', ref], { idleMs: PULL_IDLE_MS });
         const id = await docker(['image', 'inspect', '--format', '{{.Id}}', ref]);
         log(`[pull] ${name} ok via ${ref.split('@')[0]} ${id.slice(0, 19)}`);
         return id;
      } catch (e) {
         log(`[pull] ${name} 失败：${e.message}`);
      }
   }
   throw new Error(`所有镜像源均失败：${name} ${digest}`);
};

// 并行拉取上限：全并行（7 个）容易触发镜像源限流，4 路足以把总耗时压到「最慢的那个镜像」附近，
// 而不是串行求和——镜像一多这正是 CI 侧超时的主因
const PULL_CONCURRENCY = 4;

/** 并行拉取这批镜像，返回 name -> 本地镜像 ID；任一失败则抛出聚合错误 */
const pullAll = async (images) => {
   const ids = new Map();
   const queue = [...images];
   const failures = [];
   await Promise.all(
      Array.from({ length: Math.min(PULL_CONCURRENCY, queue.length) }, async () => {
         while (queue.length) {
            const image = queue.shift();
            try {
               ids.set(image.name, await pullByDigest(image));
            } catch (e) {
               failures.push(e.message);
            }
         }
      }),
   );
   if (failures.length) throw new Error(failures.join('；'));
   return ids;
};

/**
 * 移除占用宿主机 1889 的容器：调度器启动时会自己创建前端判题机容器占这个端口，
 * 上一轮残留的容器不退出会让新实例初始化失败。
 */
const freeJudgeMachinePort = async () => {
   const ids = (await docker(['ps', '-aq', '--filter', 'publish=1889'])).split('\n').filter(Boolean);
   if (!ids.length) return;
   await docker(['rm', '-f', ...ids]);
   log(`[cleanup] 移除占用 1889 的容器 ${ids.length} 个`);
};

const snapshot = async (service) => {
   const cid = await docker(['ps', '-q', '--filter', `label=com.docker.compose.service=${service}`]);
   if (!cid) return { service, ref: '', imageId: '', containerId: '' };
   const info = JSON.parse(await docker(['inspect', cid]))[0];
   return { service, ref: info.Config.Image, imageId: info.Image, containerId: info.Id };
};

const waitHealthy = async (service) => {
   const { health, codes, healthDeadlineMs } = SERVICES[service];
   const deadline = Date.now() + (healthDeadlineMs ?? IDLE_MS);
   let last = '';
   while (Date.now() < deadline) {
      try {
         const res = await fetch(health, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
         if (codes.includes(res.status)) return;
         last = `HTTP ${res.status}`;
      } catch (e) {
         last = e.message;
      }
      await new Promise((r) => setTimeout(r, 2_000));
   }
   throw new Error(`${service} 健康检查未通过（${health}）：${last}`);
};

const composeUp = async (services, refs) => {
   const extra = {};
   for (const s of services) {
      const cfg = SERVICES[s];
      if (cfg.refVar && refs[s]) extra[cfg.refVar] = refs[s];
   }
   // --no-deps：只动本次变化的服务。本机 override 的依赖图里 web-app 的条件被基座 list 形式
   // 覆盖，带动依赖重起会卡在 "scheduler has no healthcheck configured"，且重启依赖也没必要
   if (services.includes('challenge-judge-scheduler')) await freeJudgeMachinePort();
   // 业务栈与监控栈是不同 compose 项目，必须按项目分组分别 up
   const groups = new Map();
   for (const s of services) {
      const cfg = SERVICES[s];
      const args = cfg.composeFile
         ? ['compose', '-f', cfg.composeFile, ...(cfg.envFile ? ['--env-file', cfg.envFile] : [])]
         : composeArgs;
      const key = args.join(' ');
      if (!groups.has(key)) groups.set(key, { args, services: [] });
      groups.get(key).services.push(s);
   }
   for (const { args, services: group } of groups.values()) {
      await docker([...args, 'up', '-d', '--no-deps', ...group], { env: extra });
      for (const s of group) {
         const cid = await docker(['ps', '-q', '--filter', `label=com.docker.compose.service=${s}`]);
         if (!cid || (await docker(['inspect', '--format', '{{.State.Running}}', cid])) !== 'true') throw new Error(`${s} 容器未运行`);
      }
   }
};

const alert = async (text) => {
   if (!CFG.alertUrl) return;
   await fetch(CFG.alertUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(IDLE_MS) }).catch(() => {});
};

let busy = false;

/**
 * 进行中/已完成的部署任务（内存态，delivery -> {status, tag, commit, error}）。
 * 异步模式（CI 发 X-Quanta-Async: 1）下 POST 先回 202，CI 轮询 GET /hooks/images?delivery= 拿终态。
 * 服务重启会丢内存态：GET 时用落盘的 state.delivery 兜底判断该次发布是否已成功。
 */
const jobs = new Map();

const deploy = async (payload) => {
   const targets = payload.images.filter((i) => SERVICES[i.service]);
   const refs = {};
   const saved = [];
   for (const t of targets) saved.push(await snapshot(t.service));

   try {
      const ids = await pullAll(payload.images);

      // 非 compose 管理的镜像：把调度器使用的本地名 :latest 指到本次拉取的镜像
      for (const image of payload.images) {
         const localName = LOCAL_IMAGE_NAMES[image.name];
         if (!localName) continue;
         await docker(['tag', ids.get(image.name), `${localName}:latest`]);
         log(`[tag] ${localName}:latest -> ${ids.get(image.name).slice(0, 19)}`);
      }

      // 打标签：web-app 用「官方名:tag」并写入 compose 变量；调度器无 image:，只能换成正在用的标签；
      // observation 用固定的本地标签 challenge-observation:latest（compose 里就这么写）
      for (const t of targets) {
         const prev = saved.find((s) => s.service === t.service);
         refs[t.service] = SERVICES[t.service].refVar ? `${t.image}:${t.tag}` : SERVICES[t.service].ref || prev.ref;
         await docker(['tag', ids.get(t.name), refs[t.service]]);
      }
      await composeUp(targets.map((t) => t.service), refs);
      for (const t of targets) await waitHealthy(t.service);

      const state = readState();
      if (targets.some((t) => SERVICES[t.service].refVar)) upsertEnvVar(CFG.envFile, 'WEB_APP_REF', refs['challenge-web-app']);
      // 记下这批镜像的 digest，供下次幂等判断
      const deployedDigests = { ...(state.deployedDigests || {}), ...Object.fromEntries(payload.images.map((i) => [i.name, i.digest])) };
      const history = [{ tag: payload.tag, commit: payload.commit, at: new Date().toISOString(), status: 'ok', images: payload.images.map((i) => i.name) }, ...(state.history || [])].slice(0, 20);
      writeState({ ...state, delivery: payload.delivery, commit: payload.commit, tag: payload.tag, at: new Date().toISOString(), status: 'ok', refs, appRef: refs['challenge-web-app'] || state.appRef || '', deployedDigests, history });
      log(`[deploy] 成功 ${payload.tag} ${payload.commit.slice(0, 7)}（${targets.map((t) => t.service).join(',')}）`);
      return { ok: true, status: 'ok' };
   } catch (error) {
      log(`[deploy] 失败：${error.message}，开始回滚`);
      const restored = {};
      for (const s of saved) {
         const running = s.imageId ? await docker(['image', 'inspect', '--format', '{{.Id}}', s.imageId]).catch(() => '') : '';
         if (!running) {
            log(`[rollback] ${s.service} 上一版本镜像 ${s.imageId.slice(0, 19)} 已不在本地，无法回滚`);
            continue;
         }
         await docker(['tag', s.imageId, s.ref]);
         restored[s.service] = s.ref;
      }
      let status = 'failed';
      if (Object.keys(restored).length) {
         try {
            await composeUp(Object.keys(restored), restored);
            for (const s of Object.keys(restored)) await waitHealthy(s);
            status = 'rolled-back';
            if (restored['challenge-web-app']) upsertEnvVar(CFG.envFile, 'WEB_APP_REF', restored['challenge-web-app']);
            log(`[rollback] 已回到原版本：${Object.values(restored).join(', ')}`);
         } catch (e) {
            status = 'rollback-failed';
            log(`[rollback] 回滚也失败：${e.message}`);
         }
      }
      const state = readState();
      const history = [{ tag: payload.tag, commit: payload.commit, at: new Date().toISOString(), status, error: error.message }, ...(state.history || [])].slice(0, 20);
      writeState({ ...state, status, history });
      await alert(`[quanta-challenge] 部署 ${payload.tag} 失败（${status}）：${error.message}`);
      return { ok: false, status, error: error.message };
   }
};

const verify = (timestamp, rawBody, header) => {
   if (!CFG.secret) return false;
   const expected = createHmac('sha256', CFG.secret).update(`${timestamp}.${rawBody}`).digest();
   const given = Buffer.from(String(header || '').replace(/^sha256=/, ''), 'hex');
   if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
   return Math.abs(Date.now() / 1000 - Number(timestamp)) <= SKEW_S;
};

const json = (res, code, payload) => {
   if (res.writableEnded || res.destroyed) return; // 调用方可能已超时断开，直接忽略
   res.writeHead(code, { 'content-type': 'application/json' });
   res.end(JSON.stringify(payload));
};

const server = createServer((req, res) => {
   const state = readState();

   if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { status: 'ok', busy, deployed: { commit: state.commit || '', tag: state.tag || '', at: state.at || '', status: state.status || '' } });
   }
   // 异步模式的状态查询：GET /hooks/images?delivery=<uuid> -> {status: running|ok|failed|unknown}
   if (req.method === 'GET' && req.url.startsWith('/hooks/images')) {
      const delivery = new URL(req.url, 'http://localhost').searchParams.get('delivery') || '';
      if (!delivery) return json(res, 400, { error: 'missing delivery' });
      const job = jobs.get(delivery);
      if (job) {
         return json(res, 200, { delivery, status: job.status, tag: job.tag, commit: job.commit, error: job.error || undefined, finishedAt: job.finishedAt || undefined });
      }
      // 重启后内存态丢失：state.delivery 是最近一次成功发布的 delivery，命中即视为成功
      if (state.delivery === delivery) return json(res, 200, { delivery, status: 'ok', tag: state.tag || '', commit: state.commit || '' });
      return json(res, 200, { delivery, status: 'unknown' });
   }
   if (req.method !== 'POST' || req.url !== '/hooks/images') return json(res, 404, { error: 'not found' });

   const chunks = [];
   const bodyTimer = setTimeout(() => {
      json(res, 408, { error: 'body timeout' });
      req.destroy();
   }, IDLE_MS);

   req.on('data', (c) => {
      chunks.push(c);
      if (Buffer.concat(chunks).length > MAX_BODY) {
         clearTimeout(bodyTimer);
         json(res, 413, { error: 'body too large' });
         req.destroy();
      }
   });
   req.on('end', () => {
      clearTimeout(bodyTimer);
      const raw = Buffer.concat(chunks).toString('utf8'); // 验签必须用原始字节
      if (!verify(req.headers['x-quanta-timestamp'], raw, req.headers['x-quanta-signature'])) return json(res, 403, { error: 'invalid signature' });
      if (req.headers['x-quanta-event'] !== 'images.published') return json(res, 400, { error: 'unexpected event' });

      let payload;
      try {
         payload = JSON.parse(raw);
      } catch {
         return json(res, 400, { error: 'invalid json' });
      }
      if (!payload.delivery || !payload.commit || !Array.isArray(payload.images) || payload.images.length === 0) return json(res, 400, { error: 'missing fields' });

      const cur = readState();
      const known = cur.deployedDigests || {};
      // 幂等键落在镜像 digest 上：同一个 commit 可以分批发布（images[] 只含本次重建的镜像），
      // 只按 commit 判会把手动补跑的那批错当成「已部署」而直接跳过
      if (cur.delivery === payload.delivery || (cur.commit === payload.commit && payload.images.every((i) => known[i.name] === i.digest))) {
         return json(res, 200, { skipped: 'already deployed', tag: cur.tag || payload.tag });
      }
      if (busy) return json(res, 429, { error: 'deploy in progress', tag: cur.tag || '' });

      busy = true;
      log(`[hook] 接受 ${payload.tag} ${payload.commit.slice(0, 7)} images=${payload.images.map((i) => i.name).join(',')}`);
      // 异步模式：先回 202，CI 轮询上面的 GET 拿终态。同步回包要一条连接静默扛住整个
      // 拉取过程，镜像一多就会被中间 NAT / 代理在几分钟内掐断，CI 只能看到超时假失败。
      if (req.headers['x-quanta-async'] === '1') {
         const job = { status: 'running', tag: payload.tag, commit: payload.commit, error: '', startedAt: new Date().toISOString() };
         jobs.set(payload.delivery, job);
         json(res, 202, { accepted: true, delivery: payload.delivery, commit: payload.commit, tag: payload.tag, status: 'running' });
         deploy(payload)
            .then((r) => Object.assign(job, { status: r.ok ? 'ok' : 'failed', error: r.error || '' }))
            .catch((e) => Object.assign(job, { status: 'failed', error: e.message }))
            .finally(() => {
               busy = false;
               job.finishedAt = new Date().toISOString();
               log(`[job] ${payload.delivery} ${payload.tag} -> ${job.status}${job.error ? `（${job.error}）` : ''}`);
            });
         return;
      }
      // 兼容旧客户端：同步等部署结束再回包（成功 200 / 失败 500）
      deploy(payload)
         .then((r) => (r.ok
            ? json(res, 200, { ok: true, status: r.status, tag: payload.tag, commit: payload.commit })
            : json(res, 500, { ok: false, status: r.status, error: r.error, tag: payload.tag, commit: payload.commit })))
         .catch((e) => json(res, 500, { ok: false, status: 'failed', error: e.message }))
         .finally(() => { busy = false; });
   });
});

server.headersTimeout = IDLE_MS;
server.requestTimeout = IDLE_MS;
server.keepAliveTimeout = IDLE_MS;
server.on('connection', (socket) => socket.setKeepAlive(true, KEEPALIVE_MS));

if (!CFG.secret) {
   console.error('缺少 DEPLOY_WEBHOOK_SECRET，拒绝启动');
   process.exit(1);
}
for (const p of [CFG.envFile, join(CFG.repoDir, CFG.composeBase)]) {
   if (!existsSync(isAbsolute(p) ? p : join(CFG.repoDir, p))) console.error(`警告：找不到 ${p}`);
}

server.listen(CFG.port, CFG.host, () => log(`[boot] listening on ${CFG.host}:${CFG.port} repo=${CFG.repoDir} mirrors=${CFG.mirrors.join(',')}`));
