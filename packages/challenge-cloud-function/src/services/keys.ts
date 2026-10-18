import { createHmac } from 'node:crypto';
import { config, type Scope } from '../config';
import prisma from '../utils/prisma';

export interface ResolvedKey {
   keyId: string;
   type: 'internal' | 'apiKey';
   secret: string;
   scopes: Scope[];
   /** 允许调用的函数名；配合 `restricted` 使用。 */
   allowedFunctions: string[];
   /** true 时，只有出现在 allowedFunctions 里的函数可被调用；false 时不限制。 */
   restricted: boolean;
}

/** 外部 API Key 的派生：secret = base64url(HMAC_SHA256(CF_MASTER_SECRETS[version], keyId))；库中不存 secret，数据库泄露 ≠ 密钥泄露。 */
export const deriveSecret = (
   keyId: string,
   masterVersion: number,
): string | null => {
   const master = config.masterSecrets[String(masterVersion)];
   if (!master) return null;
   return createHmac('sha256', master).update(keyId).digest('base64url');
};

/** 解析 keyId → 可用于验签的密钥信息；内部与外部密钥走同一条返回路径，签名校验只有一份逻辑。 */
export const resolveKey = async (
   keyId: string,
): Promise<ResolvedKey | null> => {
   if (Object.prototype.hasOwnProperty.call(config.internalKeys, keyId)) {
      const isJudge = keyId === 'judge';
      return {
         keyId,
         type: 'internal',
         secret: config.internalKeys[keyId]!,
         scopes: config.internalKeyScopes[keyId] ?? ['invoke'],
         // 判题环境无论是否配置白名单，都**必须**受白名单约束：
         // 未配置时白名单为空 = 判题不能调用任何函数（安全默认）。
         allowedFunctions: isJudge ? config.judgeAllowedFunctions : [],
         restricted: isJudge,
      };
   }

   const row = await prisma.cloudFunctionApiKey.findUnique({
      where: { keyId },
   });
   if (!row || !row.enabled) return null;
   if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

   const secret = deriveSecret(keyId, row.masterVersion);
   if (!secret) return null;

   return {
      keyId,
      type: 'apiKey',
      secret,
      scopes: (row.scopes as Scope[]) ?? [],
      allowedFunctions: row.allowedFunctions ?? [],
      restricted: (row.allowedFunctions ?? []).length > 0,
   };
};
