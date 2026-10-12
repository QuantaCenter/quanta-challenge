#!/usr/bin/env node
/**
 * 构建并发送「镜像已发布」的部署 webhook（契约见 docs/IMAGE_WEBHOOK.md）。
 *
 * 为什么单独成脚本：
 * 1. 报文要签 HMAC 且签的是「时间戳 + 原始 body」，shell 里拼 JSON + 算签名很容易写出
 *    签名与报文不一致（换行、引号转义）的坑，而这种错误在服务端只表现为「签名无效」，
 *    极难定位；
 * 2. 可以用 --dry-run 在本地打印出**真实**的报文与签名，服务端照着联调。
 *
 * 用法：
 *   node scripts/ci/notify-deploy.mjs --images-file /tmp/images.txt --tag sha-abc1234
 *   node scripts/ci/notify-deploy.mjs --images-file ... --dry-run   # 只打印，不发送
 *
 * images 文件的每行格式：<name>|<image>|<digest>
 * 环境变量：WEBHOOK_URL、WEBHOOK_SECRET（dry-run 可省略）以及 GITHUB_* 系列。
 */
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * 镜像 → docker compose 服务名的映射。
 *
 * 注意只有 web-app / judge-scheduler / cloud-function 是默认 compose profile 里的服务；
 * judge-machine 跑在宿主机（端口 1889），live-server 镜像是调度器在判题时按需构建的，
 * 两者都不由 `docker compose up` 管理，因此 service 为 null，服务端自行决定怎么处理
 * （预拉镜像 / 重启宿主机进程）。
 */
const COMPOSE_SERVICE = {
   'web-app': 'challenge-web-app',
   'judge-scheduler': 'challenge-judge-scheduler',
   'judge-machine': null,
   'live-server': null,
   'backend-service': null,
   'backend-judge-machine': null,
   'cloud-function': 'challenge-cloud-function',
};

// webhook 同步等部署完成（docker pull 最长 8 分钟）才回包
const REQUEST_TIMEOUT_MS = 15 * 60_000;
// 响应体只用于日志，超出部分丢弃
const MAX_RESPONSE_BYTES = 64 * 1024;

const args = process.argv.slice(2);
const option = (name) => {
   const i = args.indexOf(`--${name}`);
   return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const dryRun = has('dry-run');
const imagesFile = option('images-file');
const tag = option('tag') || '';

if (!imagesFile) {
   console.error('缺少 --images-file（每行 name|image|digest）');
   process.exit(2);
}
if (!dryRun && (!process.env.WEBHOOK_URL || !process.env.WEBHOOK_SECRET)) {
   console.error('缺少环境变量 WEBHOOK_URL / WEBHOOK_SECRET');
   process.exit(2);
}

const images = readFileSync(imagesFile, 'utf8')
   .split('\n')
   .map((line) => line.trim())
   .filter(Boolean)
   .map((line) => {
      const [name, image, digest] = line.split('|');
      if (!name || !image || !digest) {
         console.error(`images 文件行格式错误（应为 name|image|digest）: ${line}`);
         process.exit(2);
      }
      return { name, service: COMPOSE_SERVICE[name] ?? null, image, tag, digest };
   });

if (images.length === 0) {
   console.error('images 文件为空，没有需要通知的镜像');
   process.exit(2);
}

const timestamp = Math.floor(Date.now() / 1000);
const delivery = randomUUID();
const body = JSON.stringify(
   {
      event: 'images.published',
      delivery,
      repository: process.env.GITHUB_REPOSITORY || '',
      ref: process.env.GITHUB_REF || '',
      commit: process.env.GITHUB_SHA || '',
      shortCommit: (process.env.GITHUB_SHA || '').slice(0, 7),
      tag,
      publishedAt: new Date().toISOString(),
      actor: process.env.GITHUB_ACTOR || '',
      runId: process.env.GITHUB_RUN_ID || '',
      runUrl: `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`,
      images,
   },
   null,
   2,
);

// 签「时间戳 + 原始 body」：body 被篡改则签名不匹配；时间戳用于防重放。
const signature = createHmac('sha256', process.env.WEBHOOK_SECRET || 'dry-run')
   .update(`${timestamp}.${body}`)
   .digest('hex');

const headers = {
   'Content-Type': 'application/json',
   'X-Quanta-Event': 'images.published',
   'X-Quanta-Delivery': delivery,
   'X-Quanta-Timestamp': String(timestamp),
   'X-Quanta-Signature': `sha256=${signature}`,
};

if (dryRun) {
   console.log(`POST ${process.env.WEBHOOK_URL || '<WEBHOOK_URL>'}`);
   for (const [k, v] of Object.entries(headers)) console.log(`${k}: ${v}`);
   console.log('');
   console.log(body);
   process.exit(0);
}

/**
 * POST 并等完整响应。超时只由 REQUEST_TIMEOUT_MS 决定。
 *
 * 不用 fetch：undici 的 headersTimeout 默认 300s，AbortSignal 覆盖不掉它，
 * 等待超过 5 分钟的响应会被 undici 提前断开。
 */
const postJson = (url, payload) =>
   new Promise((resolve, reject) => {
      const target = new URL(url);
      const send = target.protocol === 'http:' ? httpRequest : httpsRequest;
      const req = send(
         target,
         {
            method: 'POST',
            headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) },
         },
         (res) => {
            const chunks = [];
            let size = 0;
            res.on('data', (chunk) => {
               size += chunk.length;
               if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk);
            });
            res.on('end', () =>
               resolve({
                  status: res.statusCode ?? 0,
                  statusText: res.statusMessage ?? '',
                  text: Buffer.concat(chunks).toString('utf8'),
               }),
            );
            res.on('error', reject);
         },
      );
      const timer = setTimeout(() => {
         req.destroy(new Error(`等待响应超过 ${REQUEST_TIMEOUT_MS / 60_000} 分钟`));
      }, REQUEST_TIMEOUT_MS);
      req.on('close', () => clearTimeout(timer));
      req.on('error', reject);
      req.end(payload);
   });

const response = await postJson(process.env.WEBHOOK_URL, body).catch((error) => {
   console.error(`请求失败: ${error.message}`);
   process.exit(1);
});

console.log(`HTTP ${response.status} ${response.statusText}`);
if (response.text) console.log(response.text);

if (response.status < 200 || response.status >= 300) {
   // 不自动重试：构建产物已经在 registry 里，重放用本脚本手动触发即可（见 docs/IMAGE_WEBHOOK.md）
   console.error('部署 webhook 返回非 2xx，本次发布视为未生效');
   process.exit(1);
}
