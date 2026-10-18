import { thumbHashToDataURL } from 'thumbhash';

/** 将 base64 编码的 thumbhash 解码为 PNG data URL（纯计算实现，适合组件逐张渲染；client.ts 则走 Web Worker 批量转换）。仅限客户端调用，hash 为空时返回空串。 */
export const thumbhashToDataUrl = (hash: string) => {
   if (!hash) return '';

   const bytes = Uint8Array.from(atob(hash), (char) => char.charCodeAt(0));
   return thumbHashToDataURL(bytes);
};
