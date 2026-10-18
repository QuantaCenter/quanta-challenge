// 以正确签名调用「判题完成」回调，用于修复统计/排行榜数据。 用途：判题完成后的分数、正确率、全局排行榜、通知都由调度器回调本接口写入。 如果回调因密钥不匹配、Web 应用当时不可用等原因丢失，这些数据就会停留在旧值， 而判题记录本身仍显示成功——很难发现。此脚本用同一套签名算法手工重放一次， 触发 user_statistics 按权威公式整表重算（幂等，重复执行不会重复计分）。 用法： node scripts/replay-webhook.mjs <judgeRecordId> 注意：需要与调度器一致的 OPENAPI_WEBHOOK_SECRET（从 .env 读取）。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RECORD_ID = process.argv[2];
if (!RECORD_ID) {
   console.error('用法: node scripts/replay-webhook.mjs <judgeRecordId>');
   process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');

const APP = process.env.APP_SERVER || 'http://localhost:3000';
const PATH = '/api/webhooks/judge-complete';

const envText = readFileSync(path.join(repoRoot, 'packages/challenge-web-app/.env'), 'utf8');
const secret =
   envText.match(/^OPENAPI_WEBHOOK_SECRET=(.*)$/m)?.[1]?.trim() ?? 'default_secret';

const params = { recordId: RECORD_ID };
const sortedParamString = Object.keys(params)
   .sort()
   .map((k) => `${k}=${params[k]}`)
   .join('&');
const timestamp = Date.now();
const signature = createHash('sha256')
   .update(`${PATH}?${sortedParamString}${timestamp}${secret}`)
   .digest('hex');

const res = await fetch(`${APP}${PATH}?recordId=${RECORD_ID}`, {
   headers: { Cookie: `webhook_timestamp=${timestamp}; sign=${signature};` },
});
console.log(`HTTP ${res.status} ${await res.text()}`);
