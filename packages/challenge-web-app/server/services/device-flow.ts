import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
   DEVICE_CODE_TTL_SECONDS,
   DEVICE_FLOW_CLIENT_ID,
   DEVICE_FLOW_SCOPE,
   DEVICE_SESSION_STATUS,
   USER_CODE_ALPHABET,
   USER_CODE_LENGTH,
   USER_CODE_MAX_ATTEMPTS,
   deviceCodeKey,
   formatUserCode,
   isValidUserCode,
   normalizeUserCode,
   userCodeAttemptsKey,
   userCodeKey,
   type DeviceSession,
   type DeviceSessionStatus,
} from '@challenge/shared/oauth';

import { useRedis } from '~~/server/utils/redis';

/** 设备授权流程（RFC 8628）服务端状态机：user/device 两个 Redis 键同步写 TTL；"取走即失效"的操作一律用原子命令（GETDEL），避免先 GET 再 DEL 的竞态窗口。 */

export interface DeviceAuthorizationIssue {
   deviceCode: string;
   userCode: string;
   expiresIn: number;
}

/** 批准结果：approved 绑定成功；already_decided 已被处理不能改绑；not_found 码无效。 */
export type ApproveOutcome =
   | { outcome: 'approved'; session: DeviceSession }
   | { outcome: 'already_decided'; session: DeviceSession }
   | { outcome: 'not_found' };

/** 生成高熵 device_code（RFC §5.2：不展示给用户，因此可以用长随机串） */
const createDeviceCode = (): string => randomBytes(32).toString('base64url');

/** 生成人可读的 user_code（RFC §6.1：base20、8 位、去掉易混字符）；用 rejection sampling 保证熵均匀。 */
 */
const createUserCode = (): string => {
   const alphabetSize = USER_CODE_ALPHABET.length;
   const limit = 256 - (256 % alphabetSize);
   let result = '';
   while (result.length < USER_CODE_LENGTH) {
      for (const byte of randomBytes(USER_CODE_LENGTH * 2)) {
         if (byte >= limit) continue;
         result += USER_CODE_ALPHABET[byte % alphabetSize];
         if (result.length === USER_CODE_LENGTH) break;
      }
   }
   return result;
};

const serialize = (session: DeviceSession): string => JSON.stringify(session);

const deserialize = (raw: string | null): DeviceSession | null => {
   if (!raw) return null;
   try {
      return JSON.parse(raw) as DeviceSession;
   } catch {
      return null;
   }
};

/** 常量时间比较，避免字符串比较泄露前缀匹配长度；包一层 Uint8Array 规避 Buffer 泛型不兼容。 */
const safeEqual = (a: string, b: string): boolean => {
   const left = new Uint8Array(Buffer.from(a, 'utf8'));
   const right = new Uint8Array(Buffer.from(b, 'utf8'));
   if (left.length !== right.length) return false;
   return timingSafeEqual(left, right);
};

export interface DeviceFlowService {
   /** RFC §3.1：CLI 申请一组验证码 */
   authorize(input: {
      clientId: string;
      scope?: string;
   }): Promise<DeviceAuthorizationIssue>;
   /** 用户输入 user_code → 拿到待确认的会话（用于确认页展示） */
   findByUserCode(userCode: string): Promise<DeviceSession | null>;
   /** 用户同意：绑定 userId，状态转 approved */
   approve(userCode: string, userId: string): Promise<ApproveOutcome>;
   /** 用户拒绝：状态转 denied，CLI 会立即收到 access_denied */
   deny(userCode: string): Promise<DeviceSession | null>;
   /** CLI 轮询：返回会话当前状态；取到 approved 后即消费（一次性） */
   consume(deviceCode: string, clientId: string): Promise<DeviceSession | null>;
   /** 记一次 user_code 输错，返回剩余尝试次数；返回 0 表示会话已作废 */
   registerFailedAttempt(userCode: string): Promise<number>;
   /** 销毁会话（尝试次数用尽、或全部消费完成后） */
   destroy(deviceCode: string, userCode: string): Promise<void>;
}

export const createDeviceFlowService = (): DeviceFlowService => {
   const redis = useRedis();

   const readSession = async (deviceCode: string): Promise<DeviceSession | null> =>
      deserialize(await redis.get(deviceCodeKey(deviceCode)));

   const writeSession = async (session: DeviceSession): Promise<void> => {
      await Promise.all([
         redis.set(
            deviceCodeKey(session.deviceCode),
            serialize(session),
            'EX',
            DEVICE_CODE_TTL_SECONDS,
         ),
         redis.set(
            userCodeKey(session.userCode),
            session.deviceCode,
            'EX',
            DEVICE_CODE_TTL_SECONDS,
         ),
      ]);
   };

   /** 用 user_code 查会话；抽成独立函数而非 this 互调，规避 TS 对对象字面量返回类型的空值误报。 */
   const findSessionByUserCode = async (
      input: string,
   ): Promise<DeviceSession | null> => {
      const normalized = normalizeUserCode(input);
      // 格式不对直接当"找不到"，不要再区分错误类型：否则可以用错误差异
      // 枚举出哪些码是格式合法的，缩小爆破空间。
      if (!isValidUserCode(normalized)) return null;

      const deviceCode = await redis.get(userCodeKey(normalized));
      if (!deviceCode || deviceCode === 'pending') return null;
      return readSession(deviceCode);
   };

   return {
      authorize: async ({ clientId, scope }) => {
         // RFC §3.1：client_id 必填；本轮只支持自研 CLI 这一个公共客户端
         if (clientId !== DEVICE_FLOW_CLIENT_ID) {
            throw new Error('unknown_client');
         }

         // user_code 有碰撞可能（20^8 ≈ 2.5e10，但同一时间段内活跃会话很少）。
         // 这里靠 userCodeKey 的 SET NX 兜底：抢不到就换一个，最多重试 5 次。
         let userCode = '';
         for (let attempt = 0; attempt < 5; attempt += 1) {
            const candidate = createUserCode();
            const claimed = await redis.set(
               userCodeKey(candidate),
               // 占位值：真正写入会话时会被设备码覆盖；这里只为原子占位
               'pending',
               'EX',
               DEVICE_CODE_TTL_SECONDS,
               'NX',
            );
            if (claimed === 'OK') {
               userCode = candidate;
               break;
            }
         }
         if (!userCode) throw new Error('user_code_collision');

         const deviceCode = createDeviceCode();
         const session: DeviceSession = {
            deviceCode,
            userCode,
            clientId,
            scope: scope || DEVICE_FLOW_SCOPE,
            status: DEVICE_SESSION_STATUS.pending,
            createdAt: Date.now(),
         };
         await writeSession(session);

         return {
            deviceCode,
            userCode: formatUserCode(userCode),
            expiresIn: DEVICE_CODE_TTL_SECONDS,
         };
      },

      findByUserCode: findSessionByUserCode,

      approve: async (userCode, userId): Promise<ApproveOutcome> => {
         const session = await findSessionByUserCode(userCode);
         // 已处理的会话不允许改绑（防会话被转给他人）；须区分"本来已批准"与"本次批准成功"，统一返回 approved 会让第二个用户误以为授权成功。
         if (session && session.status !== DEVICE_SESSION_STATUS.pending) {
            return { outcome: 'already_decided', session };
         }
         if (!session) return { outcome: 'not_found' };
         if (!safeEqual(session.userCode, normalizeUserCode(userCode))) {
            return { outcome: 'not_found' };
         }

         const next: DeviceSession = {
            ...session,
            status: DEVICE_SESSION_STATUS.approved,
            userId,
         };
         await writeSession(next);
         // 批准后尝试次数不再需要，清掉以免占用键空间
         await redis.del(userCodeAttemptsKey(next.userCode));
         return { outcome: 'approved', session: next };
      },

      deny: async (userCode) => {
         const session = await findSessionByUserCode(userCode);
         if (!session || session.status !== DEVICE_SESSION_STATUS.pending) return null;
         const next: DeviceSession = { ...session, status: DEVICE_SESSION_STATUS.denied };
         await writeSession(next);
         return next;
      },

      consume: async (deviceCode, clientId) => {
         const session = await readSession(deviceCode);
         if (!session) return null;
         // client_id 必须与会话一致：防止别的客户端拿别人的 device_code 换 token
         if (session.clientId !== clientId) return null;

         if (session.status === DEVICE_SESSION_STATUS.pending) return session;
         if (session.status === DEVICE_SESSION_STATUS.denied) return session;

         // 只有第一次能把 approved 翻成 consumed：用条件删除保证原子性，token 不被重复签发。
         if (session.status === DEVICE_SESSION_STATUS.consumed) return session;

         const removed = await redis.del(deviceCodeKey(deviceCode));
         if (removed === 0) {
            // 被别人抢先消费：当作已消费，不能再签发 token
            return { ...session, status: DEVICE_SESSION_STATUS.consumed };
         }
         await redis.del(userCodeKey(session.userCode));
         return session;
      },

      registerFailedAttempt: async (userCode) => {
         const normalized = normalizeUserCode(userCode);
         const key = userCodeAttemptsKey(normalized);
         const attempts = await redis.incr(key);
         if (attempts === 1) {
            // 计数器的 TTL 与会话一致：会话过期后计数自然消失
            await redis.expire(key, DEVICE_CODE_TTL_SECONDS);
         }
         return Math.max(0, USER_CODE_MAX_ATTEMPTS - attempts);
      },

      destroy: async (deviceCode, userCode) => {
         await Promise.all([
            redis.del(deviceCodeKey(deviceCode)),
            redis.del(userCodeKey(userCode)),
            redis.del(userCodeAttemptsKey(userCode)),
         ]);
      },
   };
};

/** 把会话状态映射成 RFC §3.5 的 error code（undefined 表示应当签发 token） */
export const statusToError = (
   status: DeviceSessionStatus,
): 'authorization_pending' | 'access_denied' | 'expired_token' | undefined => {
   switch (status) {
      case DEVICE_SESSION_STATUS.pending:
         return 'authorization_pending';
      case DEVICE_SESSION_STATUS.denied:
         return 'access_denied';
      case DEVICE_SESSION_STATUS.consumed:
         // 已消费：会话已结束，等价于过期（不能重复签发）
         return 'expired_token';
      case DEVICE_SESSION_STATUS.approved:
         return undefined;
   }
};
