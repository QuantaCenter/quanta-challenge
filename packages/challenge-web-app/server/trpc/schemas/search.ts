import { z } from 'zod';
import {
   type SearchType,
   validateSearchTypes,
   SEARCH_LIMITS,
} from '@challenge/shared/config';

// 导出 SearchType 供其他模块使用
export type { SearchType };

/** 搜索请求 Schema */
export const searchQuerySchema = z.object({
   q: z
      .string()
      .min(SEARCH_LIMITS.MIN_QUERY_LENGTH, '搜索关键词不能为空')
      .max(SEARCH_LIMITS.MAX_QUERY_LENGTH, '搜索关键词过长'),
   type: z
      .string()
      .optional()
      .default('all')
      .refine((val) => {
         return validateSearchTypes(val.split(','));
      }, '搜索类型无效'),
   limit: z
      .number()
      .int()
      .min(SEARCH_LIMITS.MIN_LIMIT)
      .max(SEARCH_LIMITS.MAX_LIMIT)
      .optional()
      .default(SEARCH_LIMITS.DEFAULT_LIMIT),
   offset: z.number().int().min(0).optional().default(0),
});
