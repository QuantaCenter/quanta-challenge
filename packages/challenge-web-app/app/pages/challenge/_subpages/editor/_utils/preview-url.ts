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

/** WebContainer 预览域名形如 `<id>--<port>--<hash>.<区域>.webcontainer-api.io`，端口编码在子域里 */
const PORT_IN_HOST = /--(\d+)--/;

const portOfPreviewHost = (hostname: string) => {
   const match = hostname.match(PORT_IN_HOST);
   return match ? Number(match[1]) : undefined;
};

/** 端口 → 预览源：优先用已就绪服务的地址；端口尚未就绪时按已知地址的域名格式推导 */
const previewOriginOf = (port: number, servers: IPreviewServer[]) => {
   const ready = servers.find((s) => s.port === port);
   if (ready) return new URL(ready.url).origin;

   const sample = servers.find((s) => PORT_IN_HOST.test(new URL(s.url).hostname));
   if (!sample) return undefined;
   const url = new URL(sample.url);
   url.hostname = url.hostname.replace(PORT_IN_HOST, `--${port}--`);
   return url.origin;
};

/** 预览地址 → 地址栏展示：把预览域名还原成 `http://localhost:<port>` */
export const toDisplayUrl = (previewUrl: string) => {
   try {
      const url = new URL(previewUrl);
      const port = portOfPreviewHost(url.hostname);
      if (port == null) return previewUrl;
      return `http://localhost:${port}${url.pathname}${url.search}${url.hash}`;
   } catch {
      return previewUrl;
   }
};

const PREVIEW_ORIGIN_IN_TEXT =
   /https?:\/\/[\w-]+--(\d+)--[\w-]+(?:\.[\w-]+)*\.webcontainer-api\.io/g;

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
         return currentUrl ? new URL(text, currentUrl).href : undefined;
      }

      const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`);
      if (!LOCAL_HOSTNAMES.has(url.hostname)) return url.href;

      const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
      const origin = previewOriginOf(port, servers);
      if (!origin) return undefined;
      return `${origin}${url.pathname}${url.search}${url.hash}`;
   } catch {
      return undefined;
   }
};
