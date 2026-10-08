import { randomBytes } from 'node:crypto';
import { useRedis } from './redis';

/**
 * 做题环境用的「云函数调用令牌」。
 *
 * 故意做成**不透明短 token + 服务端 Redis 映射**，而不是 JWT：
 *   · 无状态签名一旦签出就无法单独撤销；短 token 随时能从 Redis 删掉；
 *   · 内容不进客户端，只有 `token → userId` 一条映射，泄漏面更小；
 *   · 不需要额外的签名密钥与派生逻辑。
 *
 * 该 token 会展示在做题页侧边栏的「云函数调用凭证」里，并被用户写进自己的解题代码
 * （判题环境同样用它）；因此它必须是**短时**的（默认 2 小时），且只能以该用户身份 invoke。
 */
const TOKEN_KEY_PREFIX = 'cf:invoke:token:';
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

export const issueCloudFunctionToken = async (
   userId: string,
): Promise<string> => {
   const token = randomBytes(24).toString('base64url');
   await useRedis().set(
      `${TOKEN_KEY_PREFIX}${token}`,
      userId,
      'EX',
      TOKEN_TTL_SECONDS,
   );
   return token;
};

export const resolveCloudFunctionToken = async (
   token: string,
): Promise<string | null> => {
   if (!token) return null;
   return useRedis().get(`${TOKEN_KEY_PREFIX}${token}`);
};
