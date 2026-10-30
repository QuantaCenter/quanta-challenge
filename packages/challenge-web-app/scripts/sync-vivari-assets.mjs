import { cp, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const sdk = dirname(require.resolve('@vivari/core/package.json'));
const assets = join(sdk, 'dist', 'assets');
// The SDK loads real package managers from /vendor on the app origin. These
// archives are pinned alongside @vivari/core so deploys cannot silently omit
// npm or pull a mutable Studio asset at runtime.
const vendorDigests = {
   'npm-pack.bin': '9cc4fdc47b130b415b2587fce0e9e24980f56fc406b510af3ba9dbcc6e72b5e0',
   'pnpm-pack.bin': '13a7eb4675441411f53014b9334df32533a5cef5999b517d8018d14d00f6a091',
   'yarn-pack.bin': 'c435041efe63f173ef6fd80d0fcb707638cd2b8e20dca25b96d22527b7a42bb5',
   'corepack-pack.bin': '648210d905862538b4e8eb754c29a7a1eaceeb9cd6e255957be4ace67f90ba2a',
};
for (const [name, expected] of Object.entries(vendorDigests)) {
   const file = join(root, 'public', 'vendor', name);
   const bytes = await readFile(file).catch(() => {
      throw new Error(`缺少 Vivari 包管理器资源 ${file}；npm/pnpm 安装将不可用`);
   });
   if (createHash('sha256').update(bytes).digest('hex') !== expected) {
      throw new Error(`Vivari 包管理器资源 ${name} 校验失败，请审查并重新锁定版本`);
   }
}
const { buildPreviewConsoleScript } = await import('../app/pages/challenge/_composables/use-web-container/preview-console.ts');
const originalSw = await readFile(join(assets, 'sw.js'), 'utf-8');
const marker = 'outBody = injectWsShim(outBody, keepPrefix, await loadDevtoolsEnabled());';
if (originalSw.split(marker).length !== 2) throw new Error('Vivari SW 注入点已改变，需要重新审核控制台补丁');
const consoleScript = buildPreviewConsoleScript('__PARENT_WINDOW__');
const workerAssets = (await readdir(assets))
   .filter((name) => /^(?:kernel|fs|fetcher|process|python-lsp)-worker-[\w-]+\.js$/.test(name))
   .map((name) => `/assets/${name}`);
if (!workerAssets.some((name) => name.includes('/kernel-worker-'))) {
   throw new Error('Vivari Kernel Worker 资源未找到');
}
const fetchMarker = 'const idx = url.pathname.indexOf(PREVIEW_MARKER);';
if (originalSw.split(fetchMarker).length !== 2) throw new Error('Vivari SW 请求路由注入点已改变，需要重新审核');
// Intercepted module-worker requests can fail when re-issued by passThrough() under COEP.
// These exact SDK-owned URLs must be fetched directly by the browser.
const assetBypass = `if (${JSON.stringify(workerAssets)}.includes(url.pathname)) return;\n  ${fetchMarker}`;

// --- challenge patch #3: 预览客户端身份表（identity-first 路由） ---
//
// 病灶: 预览工程 vite root ≠ workspace 根（例 `npx vite --port 3000 ./project`）时，
// `import.meta.env` 的垫片会以 /@fs/<绝对路径> 形态 import（root 外文件必须用 /@fs/ 寻址）。
// 该请求的 referrer 是 Vite client 模块本身（root-absolute 的 /@vite/client），既不含
// /preview/<port>/（referrerIsPreview 判不中）、也不是 /@fs/ 内部 dev 模块
// （referrerIsOwnDevModule 判不中），两条 referrer 判据都 miss → /@fs/ 分支把请求
// 放行给 HTTP 静态层 → 404 → /@vite/client 的 import 链断裂，做题页每次刷新
// 都出现 "Vite client Failed to load resource"（详见 docs/VIVARI_MIGRATION.md 补丁登记节）。
//
// 根治: SW 在自己 serve 的 /preview/<port>/ 导航上登记 resultingClientId → port。
// fetch 阶段对命中身份的 client，/@fs/ 与 env-import 两处形态学分歧按身份优先
// 路由进对应 VM；身份 miss（speculative 预加载的空 clientId、SW 被回收后等）
// 回落到原有 referrer 判据，studio 侧全部 bypass 语义不变（身份表只登记预览
// 导航产生的 client，studio 自身 client 永远查不到身份）。
const fetchAnchor = 'self.addEventListener("fetch", (event) => {';
if (originalSw.split(fetchAnchor).length !== 2) throw new Error('Vivari SW fetch 监听注入点已改变，需要重新审核');
const fsBranchMarker = 'if (url.pathname.startsWith("/@fs/") && !referrerIsPreview(event.request.referrer)) return;';
if (originalSw.split(fsBranchMarker).length !== 2) throw new Error('Vivari SW /@fs/ 分支注入点已改变，需要重新审核');
const envBranchMarker = 'if (referrerIsOwnDevModule(event.request.referrer)) return;';
if (originalSw.split(envBranchMarker).length !== 2) throw new Error('Vivari SW env referrer 分支注入点已改变，需要重新审核');
const previewNavAnchor = [
   '    event.respondWith(',
   '      loadKeepPrefixPorts().then((keep) =>',
   '        handlePreview(event, port, keep.has(port) ? full : stripped, keep.has(port)),',
   '      ),',
   '    );',
].join('\n');
if (originalSw.split(previewNavAnchor).length !== 2) throw new Error('Vivari SW /preview/ 导航分支注入点已改变，需要重新审核');

const identityDecl =
`// challenge patch #3: 预览客户端身份表。/preview/<port>/ 导航被 SW 自身 serve 时
// 在 respond 前登记 resultingClientId；fetch 阶段对命中身份的 client 优先送进对应 VM。
// clientId 不会复用，容量超限整表清空即可（miss 行为 = 回落原有 referrer/routeByClient 判据，无害）。
const vvPreviewClients = new Map();
${fetchAnchor}`;

const fsBranchReplacement =
`{
   // challenge patch #3: 身份优先 —— 已登记的预览客户端一律直送其 VM，否则维持原 referrer 判据。
   const vvIdPort = event.request.mode === "navigate" ? undefined : vvPreviewClients.get(event.clientId);
   if (vvIdPort !== undefined) {
      event.respondWith(handlePreview(event, vvIdPort, url.pathname + url.search, false));
      return;
   }
   if (!referrerIsPreview(event.request.referrer)) return;
}`;

const envBranchReplacement =
`{
   // challenge patch #3: env-import 形态同上按身份裁决；studio 侧（/node_modules/… dev 条目）不变。
   const vvIdPort = event.request.mode === "navigate" ? undefined : vvPreviewClients.get(event.clientId);
   if (referrerIsOwnDevModule(event.request.referrer)) {
      if (vvIdPort !== undefined) {
         event.respondWith(handlePreview(event, vvIdPort, url.pathname + url.search, false));
         return;
      }
      return;
   }
}`;

const seededNavAnchor =
`    if (vvPreviewClients.size > 4096) vvPreviewClients.clear();\n` +
`    if (event.request.mode === "navigate" && event.resultingClientId) vvPreviewClients.set(event.resultingClientId, port);\n` +
previewNavAnchor;

const patchedSw = originalSw
   .replace(fetchMarker, assetBypass)
   .replace(marker, `{ const tag = '<script>' + ${JSON.stringify(consoleScript)} + '</script>'; outBody = /<head([^>]*)>/i.test(outBody) ? outBody.replace(/<head([^>]*)>/i, (head) => head + tag) : tag + outBody; }\n    ${marker}`)
   .replace(fetchAnchor, identityDecl)
   .replace(fsBranchMarker, fsBranchReplacement)
   .replace(envBranchMarker, envBranchReplacement)
   .replace(previewNavAnchor, seededNavAnchor);

if (process.argv.includes('--preview')) {
   const output = join(root, 'dist-vivari-preview');
   await mkdir(output, { recursive: true });
   await writeFile(join(output, 'sw.js'), patchedSw);
   for (const name of ['__vv-bridge.html', '__vv-preview-boot.html']) {
      await copyFile(join(root, 'scripts', 'vivari-preview', name), join(output, name));
   }
   await writeFile(join(output, '_headers'), `/*\n  Cross-Origin-Embedder-Policy: credentialless\n  Cross-Origin-Resource-Policy: cross-origin\n/sw.js\n  Service-Worker-Allowed: /\n  Cross-Origin-Embedder-Policy: credentialless\n  Cross-Origin-Resource-Policy: cross-origin\n`);
   await writeFile(join(output, '_redirects'), '/preview/* /__vv-preview-boot.html 200\n');
} else {
   const output = join(root, 'public');
   await mkdir(join(output, 'assets'), { recursive: true });
   await cp(assets, join(output, 'assets'), { recursive: true });
   await writeFile(join(output, 'sw.js'), patchedSw);
}
