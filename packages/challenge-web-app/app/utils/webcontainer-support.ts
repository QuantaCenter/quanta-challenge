/**
 * WebContainer 依赖跨源隔离（SharedArrayBuffer）。若 COOP/COEP 响应头被反向代理或
 * CDN 剥离、或浏览器不支持，WebContainer.boot() 会静默失败，页面只会永久停留在
 * "正在启动开发容器…"，用户完全无法判断原因。这里提前检测并给出明确提示。
 *
 * @returns 不支持的原因；支持时返回 null
 */
export const checkWebContainerSupport = (): string | null => {
   if (!import.meta.client) return null;

   // 非安全的来源（例如用局域网 IP 走 http 访问）不会有安全上下文，
   // SharedArrayBuffer 直接不可用。这种情况提示要具体，否则很难自己想到。
   const { protocol, hostname } = window.location;
   const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1';

   if (!isLocalhost && protocol !== 'https:') {
      return (
         `当前访问地址是 ${protocol}//${hostname}，既不是 localhost 也不是 HTTPS。` +
         '浏览器只在安全上下文中提供 SharedArrayBuffer，因此在线编辑器无法在此地址运行。' +
         '请改用 http://localhost:3000 访问，或为站点配置 HTTPS。'
      );
   }

   if (typeof SharedArrayBuffer === 'undefined') {
      return '当前浏览器不支持 SharedArrayBuffer。';
   }
   if (!window.crossOriginIsolated) {
      return (
         '页面未处于跨源隔离状态（crossOriginIsolated = false）。' +
         '通常是 COOP/COEP 响应头被反向代理或 CDN 剥离所致，也可能是浏览器扩展干扰。'
      );
   }
   return null;
};
