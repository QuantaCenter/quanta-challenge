#!/usr/bin/env node
/**
 * 部署机侧 webhook：CI 推完镜像后由 GitHub Actions 调用，
 * 拉镜像 → 重启对应容器 → 失败回滚到上一个可用版本。
 *
 * 契约：docs/IMAGE_WEBHOOK.md（签名、幂等、状态码）。
 * 无第三方依赖，Node >= 20。
 *
 * 超时：所有等待（HTTP 收发、拉取无进度、健康探测、compose up）上限均为 20s，
 *       见 IDLE_MS。大镜像只要持续有进度就不会被中断，卡住 20s 即判失败。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, appendFileSync, chmodSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';

const IDLE_MS = 20_000; // 全场唯一超时上限
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
   // ghcr.io 本机直连不可用（约 0.01 MiB/s），按序回退
   mirrors: (env.GHCR_MIRRORS || 'ghcr.nju.edu.cn,ghcr.dockerproxy.net').split(',').map((s) => s.trim()).filter(Boolean),
   alertUrl: env.ALERT_WEBHOOK_URL || '',
};

// 由 compose 管理的服务：ref 走 compose 变量（web-app）或原样重打标签（调度器无 image:，只能换标签）
const SERVICES = {
   'challenge-web-app': { refVar: 'WEB_APP_REF', health: env.HEALTH_WEB_APP || 'http://127.0.0.1:3000/', codes: [200, 302, 401, 403] },
   'challenge-judge-scheduler': { refVar: '', health: env.HEALTH_JUDGE_SCHEDULER || 'http://127.0.0.1:1888/health', codes: [200] },
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
         await docker(['pull', ref]);
         const id = await docker(['image', 'inspect', '--format', '{{.Id}}', ref]);
         log(`[pull] ${name} ok via ${ref.split('@')[0]} ${id.slice(0, 19)}`);
         return id;
      } catch (e) {
         log(`[pull] ${name} 失败：${e.message}`);
      }
   }
   throw new Error(`所有镜像源均失败：${name} ${digest}`);
};

const snapshot = async (service) => {
   const cid = await docker(['ps', '-q', '--filter', `label=com.docker.compose.service=${service}`]);
   if (!cid) return { service, ref: '', imageId: '', containerId: '' };
   const info = JSON.parse(await docker(['inspect', cid]))[0];
   return { service, ref: info.Config.Image, imageId: info.Image, containerId: info.Id };
};

const waitHealthy = async (service) => {
   const { health, codes } = SERVICES[service];
   const deadline = Date.now() + IDLE_MS;
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
   await docker([...composeArgs, 'up', '-d', '--no-deps', ...services], { env: extra });
   for (const s of services) {
      const cid = await docker(['ps', '-q', '--filter', `label=com.docker.compose.service=${s}`]);
      if (!cid || (await docker(['inspect', '--format', '{{.State.Running}}', cid])) !== 'true') throw new Error(`${s} 容器未运行`);
   }
};

const alert = async (text) => {
   if (!CFG.alertUrl) return;
   await fetch(CFG.alertUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(IDLE_MS) }).catch(() => {});
};

let busy = false;

const deploy = async (payload) => {
   const targets = payload.images.filter((i) => SERVICES[i.service]);
   const refs = {};
   const saved = [];
   for (const t of targets) saved.push(await snapshot(t.service));

   try {
      const ids = new Map();
      for (const image of payload.images) ids.set(image.name, await pullByDigest(image));

      // 打标签：web-app 用「官方名:tag」并写入 compose 变量；调度器无 image:，只能换成正在用的标签
      for (const t of targets) {
         const prev = saved.find((s) => s.service === t.service);
         refs[t.service] = SERVICES[t.service].refVar ? `${t.image}:${t.tag}` : prev.ref;
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
   res.writeHead(code, { 'content-type': 'application/json' });
   res.end(JSON.stringify(payload));
};

const server = createServer((req, res) => {
   const state = readState();

   if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { status: 'ok', busy, deployed: { commit: state.commit || '', tag: state.tag || '', at: state.at || '', status: state.status || '' } });
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
      json(res, 202, { accepted: true, tag: payload.tag, commit: payload.commit });
      log(`[hook] 接受 ${payload.tag} ${payload.commit.slice(0, 7)} images=${payload.images.map((i) => i.name).join(',')}`);
      deploy(payload).finally(() => { busy = false; });
   });
});

server.headersTimeout = IDLE_MS;
server.requestTimeout = IDLE_MS;
server.keepAliveTimeout = IDLE_MS;

if (!CFG.secret) {
   console.error('缺少 DEPLOY_WEBHOOK_SECRET，拒绝启动');
   process.exit(1);
}
for (const p of [CFG.envFile, join(CFG.repoDir, CFG.composeBase)]) {
   if (!existsSync(isAbsolute(p) ? p : join(CFG.repoDir, p))) console.error(`警告：找不到 ${p}`);
}

server.listen(CFG.port, CFG.host, () => log(`[boot] listening on ${CFG.host}:${CFG.port} repo=${CFG.repoDir} mirrors=${CFG.mirrors.join(',')}`));
