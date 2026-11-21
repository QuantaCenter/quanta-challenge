import { z } from 'zod';

export const CLOUD_FUNCTION_NAME_ERROR =
   '云函数名须以小写字母开头，仅含小写字母、数字或连字符，最长 63 字符';

export const cloudFunctionNameSchema = z
   .string()
   .regex(/^[a-z][a-z0-9-]{0,62}$/, CLOUD_FUNCTION_NAME_ERROR);

export const CLOUD_FUNCTION_SOURCE_MAX_LENGTH = 200_000;

export const cloudFunctionSourceError = (
   source: string,
): string | undefined => {
   if (!source.trim()) return '云函数源码为空';
   if (source.length > CLOUD_FUNCTION_SOURCE_MAX_LENGTH) {
      return `云函数源码超过 ${CLOUD_FUNCTION_SOURCE_MAX_LENGTH} 字符`;
   }
};
