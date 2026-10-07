import { thumbHashToDataURL } from 'thumbhash';

/**
 * 将 base64 编码的 thumbhash 解码为 PNG data URL。
 *
 * 与 `client.ts` 的区别：
 * - `client.ts` 走 Web Worker + OffscreenCanvas，适合批量转换、不阻塞主线程；
 * - 这里用 `thumbhash` 的纯计算实现，没有 DOM/Worker 依赖，单张解码开销极小，
 *   适合在组件里逐张渲染占位图。
 *
 * 注意：调用方需自行保证只在客户端调用（SSR 时不应产出缩略图占位）。
 *
 * @param hash base64 编码的 thumbhash；为空时返回空串
 */
export const thumbhashToDataUrl = (hash: string) => {
   if (!hash) return '';

   const bytes = Uint8Array.from(atob(hash), (char) => char.charCodeAt(0));
   return thumbHashToDataURL(bytes);
};
