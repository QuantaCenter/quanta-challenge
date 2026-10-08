import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';

type RouterOutput = inferRouterOutputs<AppRouter>;

/** 云函数列表项（管理页表格 / 发布页卡片共用）。 */
export type CloudFunctionRow =
   RouterOutput['admin']['cloudFunction']['list'][number];

/** 云函数详情。 */
export type CloudFunctionDetail = RouterOutput['admin']['cloudFunction']['get'];

/** 云函数版本列表项。 */
export type CloudFunctionVersionRow =
   RouterOutput['admin']['cloudFunction']['listVersions'][number];

/** API Key 列表项。 */
export type CloudFunctionApiKeyRow =
   RouterOutput['admin']['cloudFunction']['listKeys'][number];

/** 签发 API Key 的返回：比列表项多一个只出现一次的 `secret`。 */
export type CreatedCloudFunctionApiKey =
   RouterOutput['admin']['cloudFunction']['createKey'];
