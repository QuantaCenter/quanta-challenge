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
const patchedSw = originalSw
   .replace(fetchMarker, assetBypass)
   .replace(marker, `{ const tag = '<script>' + ${JSON.stringify(consoleScript)} + '</script>'; outBody = /<head([^>]*)>/i.test(outBody) ? outBody.replace(/<head([^>]*)>/i, (head) => head + tag) : tag + outBody; }\n    ${marker}`);

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
