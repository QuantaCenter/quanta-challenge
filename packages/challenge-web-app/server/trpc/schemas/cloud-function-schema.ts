import { z } from 'zod';

export const FunctionNameSchema = z
   .string()
   .regex(
      /^[a-z][a-z0-9-]{0,62}$/,
      '函数名只能是小写字母、数字与连字符，且以字母开头，最长 63 字符',
   );
