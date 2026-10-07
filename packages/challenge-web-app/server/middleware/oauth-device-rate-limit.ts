import { logger } from '~~/lib/logger';
import { useRedis } from '~~/server/utils/redis';

/**
 * 设备授权端点的限速。
 *
 * RFC 8628 §3.1 明确要求注意"轮询型协议"对端点容量的压力：CLI 每 interval 秒
 * 打一次 token 端点，一个卡住的终端可能长时间持续请求。这里按 IP 限速，
 * 阈值比单客户端正常轮询（10 分钟 / 5 秒 = 120 次）宽一些，但足以挡住
 * 明显的滥用与脚本扫描。
 *
 * ⚠️ 这只防**滥用**，不替代 user_code 的爆破防护：
 * 爆破防护在 services/device-flow.ts 里按 user_code 维度计数（RFC §5.1），
 * 因为攻击者可以换 IP 来绕过 IP 限速。
 */
const LIMITS: Record<string, { times: number; windowSeconds: number }> = {
   '/api/oauth/device/authorize': { times: 30, windowSeconds: 60 },
   // 轮询端点给得宽松：正常客户端 10 分钟内约 120 次；
   // 超出说明客户端没有遵守 interval 或存在滥用。
   '/api/oauth/device/token': { times: 300, windowSeconds: 60 },
};

export default defineEventHandler(async (event) => {
   // 命名避免用 `limit`：ioredis 的 expire 重载里有个参数也叫 limit，
   // 同名变量会让 TS 在多重重载中选错分支。
   const settings = LIMITS[event.path.split('?')[0] ?? ''];
   if (!settings) return;

   const fingerprint = getRequestFingerprint(event);
   const redis = useRedis();
   const windowKey = Math.floor(Date.now() / (settings.windowSeconds * 1000));
   // 把时间窗口编进键名，就不需要额外维护过期时间，
   // 也避免"计数在窗口边界被重置"的实现差异。
   const key = `oauth_device_limit:${limitsKey(event.path)}:${fingerprint}:${windowKey}`;

   const count = await redis.incr(key);
   if (count === 1) {
      await redis.expire(key, settings.windowSeconds * 2);
   }

   if (count > settings.times) {
      logger.warn(
         { path: event.path, fingerprint, count, limit: settings.times },
         '设备授权端点触发限速',
      );
      setResponseStatus(event, 429);
      // h3 的 TypedHeaders 把 retry-after 声明为 number（RFC 9110 里它是
      // delay-seconds 或 HTTP-date），传字符串会被类型检查拦下，
      // 而 h3 会自动序列化，这里直接给数字。
      setHeader(event, 'retry-after', settings.windowSeconds);
      return {
         error: 'slow_down',
         error_description: 'too many requests to the device authorization endpoint',
      };
   }
});

const limitsKey = (path: string): string =>
   path.includes('/token') ? 'token' : 'authorize';
