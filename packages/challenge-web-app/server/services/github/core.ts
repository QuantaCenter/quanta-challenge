import {
   createCipheriv,
   createDecipheriv,
   createHash,
   randomBytes,
   timingSafeEqual,
   createHmac,
} from 'node:crypto';

export { parseRepository } from '../../../lib/github-repository';

export const opaque = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
   createHash('sha256').update(value).digest('base64url');
export const equal = (a: string, b: string) => {
   const x = Buffer.from(a);
   const y = Buffer.from(b);
   return x.length === y.length && timingSafeEqual(x, y);
};

export const encrypt = (value: string, key: Buffer, owner: string) => {
   const iv = randomBytes(12);
   const cipher = createCipheriv('aes-256-gcm', key, iv);
   cipher.setAAD(Buffer.from(owner));
   return Buffer.concat([
      iv,
      cipher.update(value, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
   ]).toString('base64');
};

export const decrypt = (value: string, key: Buffer, owner: string) => {
   const data = Buffer.from(value, 'base64');
   if (data.length < 29) {
      throw new Error('Invalid credential');
   }
   const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
   cipher.setAAD(Buffer.from(owner));
   cipher.setAuthTag(data.subarray(-16));
   return Buffer.concat([
      cipher.update(data.subarray(12, -16)),
      cipher.final(),
   ]).toString('utf8');
};

export const validSignature = (
   body: Buffer,
   signature: string,
   secret: string,
) =>
   !!secret &&
   equal(
      signature,
      `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
   );
