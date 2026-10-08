import { randomBytes } from 'node:crypto';

/** 外部 API Key 的公开标识，例如 `cfk_3fJ...`。 */
export const createKeyId = (): string =>
   `cfk_${randomBytes(12).toString('base64url')}`;

/** 派生外部密钥的随机输入，仅在签发时返回一次。 */
export const createKeyMaterial = (): string =>
   randomBytes(32).toString('base64url');

export const createTraceId = (): string => randomBytes(8).toString('hex');
