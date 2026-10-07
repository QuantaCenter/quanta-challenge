/**
 * OAuth 2.0 设备授权流程（RFC 8628）的共享协议定义。
 *
 * 放在 shared 而不是 web-app 里，是因为**两端都必须用同一份常量**：
 *   · 服务端按这些值校验 device_code / user_code 的格式；
 *   · CLI 按这些值做输入归一化与轮询节奏控制。
 * 一旦两边各写一份，"服务端把横线去掉但客户端没有"这类不一致会表现为
 * 间歇性的 `invalid_grant`，且只在用户手输了小写/带空格时才复现。
 *
 * 本文件只放**纯数据与纯函数**，不依赖 Node 或浏览器 API。
 */

/** RFC 8628 §3.4：设备码流程专用的 grant_type */
export const DEVICE_CODE_GRANT_TYPE =
   'urn:ietf:params:oauth:grant-type:device_code';

/**
 * RFC 8628 §6.1 推荐的 base20 字符集。
 *
 * 去掉的原因：元音（避免随机拼出单词）以及易混字符 0/O、1/I/L。
 * 8 位字符 ≈ 34.5 bit 熵，配合"5 次尝试上限 + 10 分钟有效期"
 * 恰好达到 RFC §5.1 给出的 2^-32 成功概率算例。
 */
export const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const USER_CODE_LENGTH = 8;
/** 展示用分组：显示 WDJB-MJHT，但比对时横线是可选的 */
export const USER_CODE_GROUP_SIZE = 4;

/** 设备码存活时间（秒）。RFC §5.4 要求"够用但尽量短"以限制钓鱼码的可利用期。 */
export const DEVICE_CODE_TTL_SECONDS = 600;
/**
 * user_code 允许的失败尝试次数（RFC §5.1）。
 * 超出后作废整条授权会话，而不是只锁那一次输入 —— 否则攻击者可以换 IP 继续爆破。
 */
export const USER_CODE_MAX_ATTEMPTS = 5;
/** RFC §3.2 的 interval 默认值 */
export const DEVICE_CODE_POLL_INTERVAL_SECONDS = 5;
/** RFC §3.5 收到 slow_down 时每次增加 5 秒 */
export const DEVICE_CODE_SLOW_DOWN_SECONDS = 5;

/** 本服务认得的 client_id（自研 CLI，无第三方 client） */
export const DEVICE_FLOW_CLIENT_ID = 'quanta-problem-creator-cli';

/** 给 CLI 展示、并用于校验申请的权限范围 */
export const DEVICE_FLOW_SCOPE = 'problem:write';

/**
 * 规范化用户输入的 user_code（RFC §6.1 明确要求）：
 *   1. 去掉服务端为可读性插入的横线等标点
 *   2. 统一转大写（用户可能输小写）
 *   3. 剔除字符集之外的字符（多余的空格、误触字符不应让合法输入作废）
 *
 * 反例说明为什么必须剔除而不是拒绝：用户从终端复制 "WDJB-MJHT " 时末尾带
 * 空格是常态，直接判非法会让"看起来完全正确的码"登录失败。
 */
export const normalizeUserCode = (input: string): string =>
   [...input.toUpperCase()].filter((char) => USER_CODE_ALPHABET.includes(char)).join('');

/** 把规范化后的码按展示分组拼回带横线的形式（用于回显给用户核对） */
export const formatUserCode = (normalized: string): string => {
   const groups: string[] = [];
   for (let i = 0; i < normalized.length; i += USER_CODE_GROUP_SIZE) {
      groups.push(normalized.slice(i, i + USER_CODE_GROUP_SIZE));
   }
   return groups.join('-');
};

export const isValidUserCode = (normalized: string): boolean =>
   normalized.length === USER_CODE_LENGTH &&
   [...normalized].every((char) => USER_CODE_ALPHABET.includes(char));

/** RFC 8628 §3.5 的错误码（另外还要处理 RFC 6749 的 invalid_grant 等） */
export const DEVICE_FLOW_ERRORS = {
   /** 用户还没批准，继续按 interval 轮询 */
   authorizationPending: 'authorization_pending',
   /** 轮询太快：interval 必须 +5s */
   slowDown: 'slow_down',
   /** 用户明确拒绝：立即停止轮询 */
   accessDenied: 'access_denied',
   /** device_code 过期，会话结束 */
   expiredToken: 'expired_token',
} as const;

export type DeviceFlowError =
   (typeof DEVICE_FLOW_ERRORS)[keyof typeof DEVICE_FLOW_ERRORS];

/** 授权会话的 Redis 键。集中在这里避免两端拼错前缀。 */
export const deviceCodeKey = (deviceCode: string): string =>
   `oauth:device:${deviceCode}`;
export const userCodeKey = (normalizedUserCode: string): string =>
   `oauth:user:${normalizedUserCode}`;
/** 尝试次数计数（独立于会话对象，便于用 INCR 原子累加） */
export const userCodeAttemptsKey = (normalizedUserCode: string): string =>
   `oauth:user-attempts:${normalizedUserCode}`;

/** 会话状态机：pending ——(用户点同意)→ approved ——(CLI 换到 token)→ consumed */
export const DEVICE_SESSION_STATUS = {
   pending: 'pending',
   approved: 'approved',
   denied: 'denied',
   /** 被 CLI 取走后立即置为该状态，防止同一 device_code 被换两次 token */
   consumed: 'consumed',
} as const;

export type DeviceSessionStatus =
   (typeof DEVICE_SESSION_STATUS)[keyof typeof DEVICE_SESSION_STATUS];

/** Redis 中保存的授权会话 */
export interface DeviceSession {
   deviceCode: string;
   /** 规范化（无横线、大写）的 user_code */
   userCode: string;
   clientId: string;
   scope: string;
   status: DeviceSessionStatus;
   /** 用户批准后写入 */
   userId?: string;
   createdAt: number;
}

/** CLI 发起设备授权请求（RFC §3.1）后拿到的响应（RFC §3.2） */
export interface DeviceAuthorizationResponse {
   device_code: string;
   user_code: string;
   verification_uri: string;
   verification_uri_complete: string;
   expires_in: number;
   interval: number;
}

/** 成功换到的令牌（RFC 6749 §5.1 的子集） */
export interface DeviceTokenResponse {
   access_token: string;
   refresh_token: string;
   token_type: 'Bearer';
   expires_in: number;
   scope: string;
}

/** 设备授权端点与令牌端点的路径（两端共用，改一处即可） */
export const DEVICE_FLOW_PATHS = {
   deviceAuthorization: '/api/oauth/device/authorize',
   deviceToken: '/api/oauth/device/token',
   /** 用户在浏览器里确认授权的人机页面 */
   verification: '/auth/device',
} as const;
