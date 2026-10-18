import { randomBytes } from 'node:crypto';
import { useRedis } from './redis';

/** 做题环境用的「云函数调用令牌」：不透明短 token + Redis 映射（可随时撤销、泄漏面小），短时（默认 2 小时）且只能以该用户身份 invoke。 */
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
