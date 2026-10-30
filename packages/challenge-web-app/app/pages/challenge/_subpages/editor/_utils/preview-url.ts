export interface IPreviewServer {
   port: number;
   url: string;
}

const LOCAL_HOSTNAMES = new Set([
   'localhost',
   '127.0.0.1',
   '0.0.0.0',
   '[::1]',
]);

/** Vivari shared-origin preview URLs use /preview/<port>/ paths. */
const PORT_IN_PATH = /^\/preview\/(\d+)(?=\/|$)/;

const portOfPreview = (url: URL) => {
   const match = url.pathname.match(PORT_IN_PATH);
   return match ? Number(match[1]) : undefined;
};

/** 端口 → 预览源：优先用已就绪服务的地址；端口尚未就绪时按已知地址的域名格式推导 */
const previewOriginOf = (port: number, servers: IPreviewServer[]) => {
   const ready = servers.find((s) => s.port === port);
   if (ready) return ready.url;

   const sample = servers.find((s) => PORT_IN_PATH.test(new URL(s.url).pathname));
   if (!sample) return undefined;
   const url = new URL(sample.url);
   url.pathname = url.pathname.replace(PORT_IN_PATH, `/preview/${port}`);
   return url.href;
};

/** 预览地址 → 地址栏展示：把预览域名还原成 `http://localhost:<port>` */
export const toDisplayUrl = (previewUrl: string) => {
   try {
      const url = new URL(previewUrl);
      const port = portOfPreview(url);
      if (port == null) return previewUrl;
      const path = url.pathname.replace(PORT_IN_PATH, '') || '/';
      return `http://localhost:${port}${path}${url.search}${url.hash}`;
   } catch {
      return previewUrl;
   }
};

const PREVIEW_ORIGIN_IN_TEXT =
   /https?:\/\/[^\s/]+\/preview\/(\d+)(?=\/|\b)/g;

/** 将文本中的预览域名替换为 localhost:port */
export const toDisplayText = (text: string) =>
   text.replace(PREVIEW_ORIGIN_IN_TEXT, (_, port) => `http://localhost:${port}`);

/**
 * 地址栏输入 → iframe 实际地址。
 * localhost / 127.0.0.1 等本地地址映射到对应端口的预览域名；
 * 以 `/` 开头的视为当前预览源下的路径；无法解析时返回 undefined。
 */
export const resolvePreviewUrl = (
   input: string,
   currentUrl: string | undefined,
   servers: IPreviewServer[],
) => {
   const text = input.trim();
   if (!text) return undefined;

   try {
      if (text.startsWith('/')) {
         if (!currentUrl) return undefined;
         const current = new URL(currentUrl);
         const port = portOfPreview(current);
         if (port == null) return new URL(text, currentUrl).href;
         const path = new URL(text, 'http://localhost');
         current.pathname = `/preview/${port}${path.pathname}`;
         current.search = path.search;
         current.hash = path.hash;
         return current.href;
      }

      const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`);
      if (!LOCAL_HOSTNAMES.has(url.hostname)) return url.href;

      const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
      const preview = previewOriginOf(port, servers);
      if (!preview) return undefined;
      const target = new URL(preview);
      target.pathname = `/preview/${port}${url.pathname}`;
      target.search = url.search;
      target.hash = url.hash;
      return target.href;
   } catch {
      return undefined;
   }
};
