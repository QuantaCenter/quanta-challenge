import { Vivari, type DirEnt, type FileSystemTree, type FSWatcher, type VivariProcess } from '@vivari/core';
import { decodeVivariImage, encodeVivariImage, type VivariImageEntry } from '@challenge/shared/vivari-image';

export type WebContainerProcess = VivariProcess;
export type { FileSystemTree, DirectoryNode, FileNode } from '@vivari/core';

const normalize = (path: string, workdir: string) => {
   const value = path === '.' || path === '/' ? '' : path.replace(/^\/+/, '');
   return `${workdir}${value ? `/${value}` : ''}`;
};
const base64 = (bytes: Uint8Array) => {
   let result = '';
   for (let i = 0; i < bytes.length; i += 0x8000) {
      result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
   }
   return btoa(result);
};

/** App-level compatibility boundary. All paths outside this class remain relative to workdir. */
export class WebContainer {
   readonly workdir: string;
   readonly path = '/usr/local/bin:/usr/bin:/bin';
   readonly fs: {
      readFile(path: string, encoding: 'utf-8' | 'utf8' | 'base64'): Promise<string>;
      readFile(path: string): Promise<Uint8Array>;
      writeFile(path: string, data: string | Uint8Array): Promise<void>;
      readdir(path: string, options: { withFileTypes: true }): Promise<DirEnt[]>;
      readdir(path: string): Promise<string[]>;
      mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
      rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
      rename(from: string, to: string): Promise<void>;
      stat(path: string): ReturnType<Vivari['fs']['stat']>;
      watch(path: string, options: { recursive?: boolean }, listener: (event: string, path: string) => void): FSWatcher;
   };

   private constructor(readonly vivari: Vivari, workdirName: string) {
      this.workdir = `/${workdirName}`;
      const full = (path: string) => normalize(path, this.workdir);
      this.fs = {
         readFile: async (path: string, encoding?: string) => {
            if (encoding === 'base64') return base64(await vivari.fs.readFile(full(path)));
            return encoding ? vivari.fs.readFile(full(path), 'utf-8') : vivari.fs.readFile(full(path));
         },
         writeFile: (path, data) => vivari.fs.writeFile(full(path), data),
         readdir: (path, options?: { withFileTypes: true }) => options?.withFileTypes
            ? vivari.fs.readdir(full(path), { withFileTypes: true })
            : vivari.fs.readdir(full(path)),
         mkdir: (path, options) => vivari.fs.mkdir(full(path), options),
         rm: (path, options) => vivari.fs.rm(full(path), options),
         rename: (from, to) => vivari.fs.rename(full(from), full(to)),
         stat: (path) => vivari.fs.stat(full(path)),
         watch: (path, options, listener) => {
            const watcher = vivari.fs.watch(full(path), options, (event) => {
               const relative = event.path.startsWith(`${this.workdir}/`)
                  ? event.path.slice(this.workdir.length + 1)
                  : event.path;
               listener(event.kind, relative);
            });
            // Vivari also buffers callback events for async iteration; drain that queue.
            void (async () => { for await (const _ of watcher) { /* callback handled it */ } })();
            return watcher;
         },
      } as typeof this.fs;
   }

   static async boot(options: { workdirName?: string; previewOrigin?: string; previewWildcardDomain?: string } = {}) {
      if (import.meta.env.PROD) {
         if (!options.previewWildcardDomain) {
            throw new Error('未配置 VIVARI_PREVIEW_WILDCARD_DOMAIN，无法启动独立预览域名');
         }
         const domain = options.previewWildcardDomain;
         if (!/^(?!-)[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) || domain.startsWith('*.') ||
             window.location.protocol !== 'https:' ||
             (window.location.hostname !== domain && window.location.hostname.endsWith(`.${domain}`))) {
            throw new Error('VIVARI_PREVIEW_WILDCARD_DOMAIN 必须是独立的 HTTPS 预览基域名');
         }
      }
      const vivari = await Vivari.boot({
         timeout: 45_000,
         previewWildcardDomain: options.previewWildcardDomain || undefined,
         previewOrigin: options.previewOrigin || undefined,
      });
      const runtime = new WebContainer(vivari, options.workdirName ?? 'workspace');
      await vivari.fs.mkdir(runtime.workdir, { recursive: true });
      return runtime;
   }

   async withWorkdir(workdirName: string) {
      const runtime = new WebContainer(this.vivari, workdirName);
      await this.vivari.fs.mkdir(runtime.workdir, { recursive: true });
      return runtime;
   }

   get destroyed() { return this.vivari.destroyed; }
   teardown() { this.vivari.teardown(); }
   spawn(command: string, args: string[] = [], options?: { env?: Record<string, string> }) {
      return this.vivari.spawn(command, args, { cwd: this.workdir, env: options?.env });
   }
   on(event: 'server-ready', listener: (port: number, url: string) => void): () => void;
   on(event: 'port', listener: (port: number, kind: 'open' | 'close') => void): () => void;
   on(event: 'error', listener: (error: { message: string }) => void): () => void;
   on(event: 'server-ready' | 'port' | 'error', listener: (...args: any[]) => void) {
      return this.vivari.on(event as any, listener as any);
   }
   previewUrl(port: number, path = '/') { return this.vivari.previewUrl(port, path); }
   attachPreview(frame: HTMLIFrameElement) { return this.vivari.attachPreview(frame); }

   async mount(tree: FileSystemTree | Uint8Array) {
      if (!(tree instanceof Uint8Array)) return this.vivari.mount(tree, { mountPoint: this.workdir });
      const { entries, files } = decodeVivariImage(tree);
      for (const entry of entries.filter((entry) => entry.kind === 'directory')) {
         await this.vivari.fs.mkdir(`${this.workdir}/${entry.path}`, { recursive: true });
      }
      for (const { entry, bytes } of files) {
         await this.vivari.fs.writeFile(`${this.workdir}/${entry.path}`, bytes);
      }
      const links = entries.filter((entry) => entry.kind === 'symlink').map((entry) => [entry.path, entry.target]);
      const modes = entries.filter((entry) => entry.kind !== 'symlink' && (entry.mode & 0o111) !== 0).map((entry) => [entry.path, entry.mode]);
      if (links.length || modes.length) {
         const manifestPath = `/.quanta-restore-${crypto.randomUUID()}.json`;
         await this.vivari.fs.writeFile(manifestPath, JSON.stringify({ links, modes }));
         try {
            const script = `const fs=require('fs');const m=JSON.parse(fs.readFileSync(${JSON.stringify(manifestPath)},'utf8'));for(const [p,t] of m.links)fs.symlinkSync(t,p);for(const [p,v] of m.modes)fs.chmodSync(p,v)`;
            const process = await this.spawn('node', ['-e', script]);
            const output = process.output.text();
            const code = await process.exit;
            if (code !== 0) throw new Error(`镜像软链接或权限还原失败，退出码 ${code}：${(await output).slice(0, 500)}`);
         } finally {
            await this.vivari.fs.rm(manifestPath, { force: true });
         }
      }
   }

   async export(path: string, options: { format: 'json' }): Promise<FileSystemTree>;
   async export(path: string, options: { format: 'binary' }): Promise<Uint8Array>;
   async export(path: string, options: { format: 'json' | 'binary' }): Promise<FileSystemTree | Uint8Array> {
      if (options.format === 'json') {
         const result = await this.vivari.export(normalize(path, this.workdir));
         if (result.truncated) throw new Error('文件系统导出超过 Vivari 上限');
         const tree: FileSystemTree = {};
         for (const file of result.files) {
            const segments = file.path.split('/');
            let parent = tree;
            for (const segment of segments.slice(0, -1)) {
               parent[segment] ??= { directory: {} };
               parent = (parent[segment] as { directory: FileSystemTree }).directory;
            }
            parent[segments.at(-1)!] = { file: { contents: file.contents } };
         }
         return tree;
      }
      const root = normalize(path, this.workdir);
      const entries: VivariImageEntry[] = [];
      const contents: Uint8Array[] = [];
      const inspectScript = "const fs=require('fs');const links=[];function walk(p){for(const n of fs.readdirSync(p)){const q=p==='.'?n:p+'/'+n;const s=fs.lstatSync(q);if(s.isSymbolicLink())links.push([q,[fs.readlinkSync(q),s.mode&4095]]);else if(s.isDirectory())walk(q)}}walk('.');process.stdout.write(JSON.stringify(links))";
      const inspect = await this.spawn('node', ['-e', inspectScript]);
      const inspectOutput = inspect.output.text();
      if (await inspect.exit !== 0) throw new Error(`无法读取镜像软链接：${(await inspectOutput).slice(0, 500)}`);
      const symlinks = new Map<string, [string, number]>(JSON.parse(await inspectOutput));
      const walk = async (dir: string, relative = ''): Promise<void> => {
         const children = await this.vivari.fs.readdir(dir, { withFileTypes: true });
         for (const child of children) {
            const itemPath = relative ? `${relative}/${child.name}` : child.name;
            const absolute = `${dir}/${child.name}`;
            const link = symlinks.get(itemPath);
            if (link) {
               entries.push({ path: itemPath, kind: 'symlink', target: link[0], mode: link[1] });
               continue;
            }
            const stat = await this.vivari.fs.stat(absolute);
            if (child.isDirectory()) {
               entries.push({ path: itemPath, kind: 'directory', mode: stat.mode & 0o7777 });
               await walk(absolute, itemPath);
            } else if (child.isFile()) {
               const bytes = await this.vivari.fs.readFile(absolute);
               entries.push({ path: itemPath, kind: 'file', mode: stat.mode & 0o7777, size: bytes.byteLength });
               contents.push(bytes);
            } else throw new Error(`镜像含不支持的条目：${itemPath}`);
         }
      };
      await walk(root);
      return encodeVivariImage(entries, contents);
   }
}
