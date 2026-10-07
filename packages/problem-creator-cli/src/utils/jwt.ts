export interface JwtClaims {
   userId?: string;
   role?: string;
   exp?: number;
   iat?: number;
}

/**
 * 只解码 JWT 的 payload 用于**展示**（过期时间、角色）。
 *
 * 刻意不校验签名：CLI 没有签名密钥，而且它本来就不该信任本地解码的结果 ——
 * 真正的鉴权发生在服务端。这里仅用于在 `qpc login --show` / `qpc doctor`
 * 里告诉用户"令牌什么时候过期"，避免把"服务端 401"误解成网络问题。
 */
export const decodeJwt = (token: string): JwtClaims | undefined => {
   const segments = token.split('.');
   if (segments.length < 2 || !segments[1]) return undefined;
   try {
      const payload = Buffer.from(
         segments[1].replace(/-/g, '+').replace(/_/g, '/'),
         'base64',
      ).toString('utf8');
      const parsed = JSON.parse(payload) as JwtClaims;
      return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
   } catch {
      return undefined;
   }
};

export const describeTokenExpiry = (
   token: string | undefined,
   now = Date.now(),
): string => {
   if (!token) return '无';
   const claims = decodeJwt(token);
   if (!claims?.exp) return '未知（无法解析 exp）';
   const expiresAt = claims.exp * 1000;
   const remainingMs = expiresAt - now;
   const stamp = new Date(expiresAt).toISOString();
   if (remainingMs <= 0) return `已过期（${stamp}）`;
   if (remainingMs < 60_000)
      return `${Math.round(remainingMs / 1000)} 秒后过期（${stamp}）`;
   return `${Math.round(remainingMs / 60_000)} 分钟后过期（${stamp}）`;
};
