import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Docker from 'dockerode';
import { resolvePnpmCacheDir } from '../utils/pnpm-cache-path';
import { Singleton } from '../utils/singleton';

const execFileAsync = promisify(execFile);

/**
 * 与题目容器里使用的 pnpm 版本必须严格一致（store 布局与 pnpm 大版本绑定）。
 * 这里默认按调度器镜像里装的版本记录，实际以题目镜像里的为准。
 */
export const PNPM_VERSION = '9.15.9';

/** 缓存挂进题目容器的目标路径。预热 / 门禁 / 题目容器都用这个路径作 --store-dir。 */
export const PROBLEM_CONTAINER_STORE_PATH = '/pnpm-store';

/** 记录"这份缓存是用哪个镜像、哪个平台、什么时候预热的"的元数据文件名（放在缓存根）。 */
const META_FILE = '.quanta-pnpm-cache.json';

export type CacheSource = 'external' | 'internal';

export interface CacheUpdateOptions {
   source: CacheSource;
   /** 含 pnpm-lock.yaml 的目录（必须是宿主机可见路径，容器会按同一路径挂载）。 */
   project?: string;
   /** 或直接点名要加载的包，"name@version" 形式。 */
   packages?: string[];
   /** 用哪个镜像预热；缺省取 PNPM_CACHE_PROBLEM_IMAGE。 */
   image?: string;
}

export interface CacheStats {
   packages: number;
   bytes: number;
   cacheDir: string;
}

export interface CacheMeta {
   version: 1;
   /** 预热所用的题目镜像名。null 表示用调度器进程自身预热的（不保证环境一致）。 */
   image: string | null;
   /** 该镜像的本地 digest；镜像一变它就变，用于判定缓存过期。 */
   imageId: string | null;
   /** 例：linux/arm64。 */
   platform: string | null;
   pnpmVersion: string;
   packages: number;
   /** 最近一次预热涉及的业务密钥（锁文件所在目录）。 */
   project: string | null;
   warmedAt: string;
}

/** pnpm 9 与 10 的索引文件位置不同，统计包数量时两种都要认。 */
const V9_INDEX_SUFFIX = '-index.json';

/**
 * 解析 Docker 的多路复用日志流。
 *
 * 未分配 TTY 的容器，`container.logs()` 返回的不是纯文本，而是逐帧的：
 *   [streamType(1B)][0,0,0][size(4B, BE)][payload]
 * 直接 `toString('utf8')` 会把帧头（含 0x00）混进文本，这些 NUL 字节既会污染错误信息，
 * 也会让 Prisma 写入时报 "unsupported Unicode escape sequence"。
 * 因此必须按帧拆开，只取 payload。
 */
const demuxDockerLogs = (buffer: Buffer): string => {
   const chunks: string[] = [];
   let offset = 0;
   let sawFrame = false;

   while (offset + 8 <= buffer.length) {
      const streamType = buffer[offset];
      // 合法的帧类型只有 0(stdin) / 1(stdout) / 2(stderr)
      if (streamType > 2) break;
      const size = buffer.readUInt32BE(offset + 4);
      const start = offset + 8;
      const end = start + size;
      if (end > buffer.length) break;
      chunks.push(buffer.subarray(start, end).toString('utf8'));
      sawFrame = true;
      offset = end;
   }

   // 不像多路复用流（例如 TTY 容器）或完全没有完整帧时，退回原文，
   // 避免把内容不慎丢掉；同时清掉 NUL 字节（Postgres 的 text/jsonb 不接受）。
   const text = sawFrame ? chunks.join('') : buffer.toString('utf8');
   return text.replace(/\u0000/g, '');
};

const parseSpec = (spec: string): [string, string] => {
   const at = spec.startsWith('@') ? spec.indexOf('@', 1) : spec.indexOf('@');
   if (at === -1) return [spec, '*'];
   return [spec.slice(0, at), spec.slice(at + 1) || '*'];
};

export class PnpmCacheService extends Singleton {
   static get instance() {
      return this.getInstance<PnpmCacheService>();
   }

   // 必须是【宿主机绝对路径】：调度器创建题目容器时把它当作 bind mount 的 Source，
   // 由宿主机的 Docker daemon 解析。因此不能写死容器内的 /app/pnpm-cache ——
   // 解析规则见 utils/pnpm-cache-path.ts。
   readonly cacheDir = resolvePnpmCacheDir();

   readonly externalRegistry =
      process.env.PNPM_CACHE_EXTERNAL_REGISTRY || 'https://registry.npmjs.org/';

   readonly internalRegistry =
      process.env.PNPM_CACHE_INTERNAL_REGISTRY || 'http://127.0.0.1:4873/';

   /** 默认的题目容器镜像名；为空时退化为"在调度器进程内预热"（仅本地调试用）。 */
   readonly problemImage = process.env.PNPM_CACHE_PROBLEM_IMAGE || '';

   /** 预热容器所在的网络：需要能访问 registry（和可选的代理）。 */
   readonly warmNetwork = process.env.PNPM_CACHE_WARM_NETWORK || 'bridge';

   readonly warmDir = process.env.PNPM_CACHE_WARM_DIR || process.env.TEMP_DIR || os.tmpdir();

   /** 仅用于"进程内预热"退化路径（本地调试）。 */
   readonly pnpmBin = process.env.PNPM_CACHE_PNPM_BIN || 'pnpm';

   private docker = new Docker();

   /** 写操作串行化：同一 store 上并发跑 pnpm 会互相踩索引与锁。 */
   private queue: Promise<unknown> = Promise.resolve();

   private enqueue<T>(task: () => Promise<T>): Promise<T> {
      const run = this.queue.then(task, task);
      this.queue = run.catch(() => undefined);
      return run;
   }

   async init() {
      // mkdir 失败时补一句人话：最典型的失败是把容器路径（/app/pnpm-cache）
      // 用在了宿主机上 —— 根目录通常不可写，报错只有一句 ENOENT/EACCES，很难定位。
      try {
         await fs.mkdir(this.cacheDir, { recursive: true });
      } catch (error: any) {
         throw new Error(
            `无法创建 pnpm 缓存目录 ${this.cacheDir}（${error?.code ?? error?.message}）。\n` +
               '该目录必须是**宿主机**上的绝对路径：调度器会把它作为 bind mount 的 Source ' +
               '交给宿主机的 Docker daemon。\n' +
               '本地开发请直接删掉 .env 里的 PNPM_CACHE_DIR（默认用 <仓库根>/.pnpm-cache），' +
               '容器部署则保持 compose 里的 /app/pnpm-cache。',
         );
      }
      const stats = await this.stats();
      const meta = await this.readMeta();
      console.log(
         `[INFO] pnpm cache dir = ${this.cacheDir} ` +
            `(packages=${stats.packages}, ${(stats.bytes / 1024 / 1024).toFixed(1)}MB)`
      );
      console.log(
         `[INFO] pnpm cache problem image = ${this.problemImage || '(未设置，将退化为进程内预热)'}`
      );
      if (meta) {
         console.log(
            `[INFO] pnpm cache meta = image:${meta.image ?? '(none)'} ` +
               `id:${meta.imageId?.slice(0, 19) ?? '-'} platform:${meta.platform ?? '-'} ` +
               `warmedAt:${meta.warmedAt}`
         );
      } else {
         console.log('[INFO] pnpm cache meta = (尚未预热)');
      }
   }

   private registryOf(source: CacheSource): string {
      if (source === 'external') return this.externalRegistry;
      if (source === 'internal') return this.internalRegistry;
      throw new Error(`未知的缓存更新来源: ${String(source)}`);
   }

   private get metaPath() {
      return path.join(this.cacheDir, META_FILE);
   }

   async readMeta(): Promise<CacheMeta | null> {
      try {
         return JSON.parse(await fs.readFile(this.metaPath, 'utf8')) as CacheMeta;
      } catch {
         return null;
      }
   }

   private async writeMeta(meta: CacheMeta): Promise<void> {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2));
   }

   private async imageInfo(image: string) {
      try {
         const info = await this.docker.getImage(image).inspect();
         return {
            id: info.Id,
            platform: `${info.Os}/${info.Architecture}${info.Variant ? `/${info.Variant}` : ''}`,
         };
      } catch (error: any) {
         throw new Error(
            `无法解析题目镜像 "${image}"（是否已构建/拉取？）：${error?.message ?? error}`
         );
      }
   }

   private async runOneShot(opts: {
      image: string;
      workdir: string;
      command: string;
      networkMode: string;
      registry?: string;
      storeReadOnly: boolean;
   }): Promise<{ exitCode: number; logs: string }> {
      const env = ['CI=true'];
      if (opts.registry) env.push(`npm_config_registry=${opts.registry}`);
      // 开发环境常用本地代理，转发给容器（容器里的 127.0.0.1 指向自身，需自行配好）。
      for (const key of ['http_proxy', 'https_proxy', 'no_proxy']) {
         const value = process.env[key] ?? process.env[key.toUpperCase()];
         if (!value) continue;
         // 指向回环地址的代理在容器里必然连不上：容器内的 127.0.0.1 是它自己，
         // 而不是宿主机。转发它只会让 pnpm 以 ECONNREFUSED 失败（实测：宿主机 shell
         // 里设了 http_proxy=http://127.0.0.1:7890，预热容器整包安装全部失败）。
         // 要真正走宿主机代理，请显式传 host.docker.internal:7890。
         if (
            key !== 'no_proxy' &&
            /(^|\/\/|@)(127\.0\.0\.1|localhost)(:|\/|$)/i.test(value)
         ) {
            console.warn(
               `[WARN] 忽略指向回环地址的 ${key}=${value}（容器内无法访问宿主机的 127.0.0.1）。` +
                  '如需代理，请改成 host.docker.internal:<port>。',
            );
            continue;
         }
         env.push(`${key}=${value}`);
      }

      const container = await this.docker.createContainer({
         Image: opts.image,
         // 必须清空镜像的 ENTRYPOINT。
         //
         // 预热用的镜像是【题目容器镜像】，而题目镜像（如 challenge-backend-service-agent）
         // 自带 entrypoint.sh：它不理会这里的 Cmd，而是去 /app/project 安装并启动服务，
         // 于是预热容器一启动就报 "题目目录不存在：/app/project" 并以 exit 1 结束。
         // 预热只需要一个「跑 pnpm 的裸 shell」，所以显式重置 Entrypoint。
         Entrypoint: [],
         Cmd: ['sh', '-c', opts.command],
         WorkingDir: opts.workdir,
         Env: env,
         HostConfig: {
            AutoRemove: false,
            NetworkMode: opts.networkMode,
            Mounts: [
               {
                  Type: 'bind',
                  Source: this.cacheDir,
                  Target: PROBLEM_CONTAINER_STORE_PATH,
                  ReadOnly: opts.storeReadOnly,
               },
               {
                  Type: 'bind',
                  Source: opts.workdir,
                  Target: opts.workdir,
                  ReadOnly: false,
               },
            ],
         },
      });

      try {
         await container.start();
         const { StatusCode } = await container.wait();
         const raw = await container.logs({ stdout: true, stderr: true });
         const logs = Buffer.isBuffer(raw)
            ? demuxDockerLogs(raw)
            : String(raw).replace(/\u0000/g, '');
         return { exitCode: StatusCode, logs };
      } finally {
         await container.remove({ force: true }).catch(() => undefined);
      }
   }

   private async runPnpm(
      args: string[],
      opts: { cwd: string; registry?: string }
   ): Promise<void> {
      await fs.mkdir(this.cacheDir, { recursive: true });
      try {
         await execFileAsync(this.pnpmBin, args, {
            cwd: opts.cwd,
            maxBuffer: 32 * 1024 * 1024,
            env: {
               ...process.env,
               CI: 'true',
               npm_config_registry: opts.registry ?? this.externalRegistry,
            },
         });
      } catch (error: any) {
         const detail = [error?.stderr, error?.stdout].filter(Boolean).join('\n').trim();
         throw new Error(
            `pnpm ${args.join(' ')} 失败（cwd=${opts.cwd}）：\n${detail || error?.message}`
         );
      }
   }

   async update({ source, project, packages, image }: CacheUpdateOptions) {
      return this.enqueue(async () => {
         const registry = this.registryOf(source);
         const useImage = image || this.problemImage;

         let workdir = project ? path.resolve(project) : null;
         let cleanup: (() => Promise<void>) | null = null;

         if (!workdir) {
            if (!packages?.length) {
               throw new Error('必须提供 project（含 lockfile 的目录）或 packages（包名列表）');
            }
            workdir = await fs.mkdtemp(path.join(this.warmDir, 'pnpm-warm-'));
            cleanup = () => fs.rm(workdir as string, { recursive: true, force: true });
            const dependencies: Record<string, string> = {};
            for (const spec of packages) {
               const [name, range] = parseSpec(spec);
               dependencies[name] = range;
            }
            await fs.writeFile(
               path.join(workdir, 'package.json'),
               JSON.stringify({ name: 'pnpm-cache-warm', private: true, dependencies }, null, 2)
            );
            if (!useImage) {
               // 退化路径：先在进程内解析出锁文件（容器路径下由容器自己解析）。
               await this.runPnpm(['install', '--lockfile-only'], { cwd: workdir, registry });
            }
         }

         try {
            if (useImage) {
               const info = await this.imageInfo(useImage);
               const command = project
                  ? `pnpm install --frozen-lockfile --store-dir ${PROBLEM_CONTAINER_STORE_PATH}`
                  : `pnpm install --lockfile-only --store-dir ${PROBLEM_CONTAINER_STORE_PATH} && ` +
                    `pnpm install --frozen-lockfile --store-dir ${PROBLEM_CONTAINER_STORE_PATH}`;
               const { exitCode, logs } = await this.runOneShot({
                  image: useImage,
                  workdir,
                  command,
                  networkMode: this.warmNetwork,
                  registry,
                  storeReadOnly: false,
               });
               if (exitCode !== 0) {
                  throw new Error(`预热容器失败（exit ${exitCode}）：\n${logs.slice(-4000)}`);
               }
               const stats = await this.stats();
               const meta: CacheMeta = {
                  version: 1,
                  image: useImage,
                  imageId: info.id,
                  platform: info.platform,
                  pnpmVersion: PNPM_VERSION,
                  packages: stats.packages,
                  project: project ? path.resolve(project) : null,
                  warmedAt: new Date().toISOString(),
               };
               await this.writeMeta(meta);
               return { source, registry, cacheDir: this.cacheDir, image: useImage, meta, stats };
            }

            // 退化路径：调度器进程内预热。
            console.warn(
               '[WARN] 未配置题目镜像，正在调度器进程内预热：' +
                  '不保证与题目容器的平台/openssl 一致，仅供本地调试。'
            );
            await this.runPnpm(['fetch', '--store-dir', this.cacheDir], { cwd: workdir, registry });
            const stats = await this.stats();
            const meta: CacheMeta = {
               version: 1,
               image: null,
               imageId: null,
               platform: null,
               pnpmVersion: PNPM_VERSION,
               packages: stats.packages,
               project: project ? path.resolve(project) : null,
               warmedAt: new Date().toISOString(),
            };
            await this.writeMeta(meta);
            return { source, registry, cacheDir: this.cacheDir, image: null, meta, stats };
         } finally {
            await cleanup?.();
         }
      });
   }

   async verify({ project, image }: { project: string; image?: string }) {
      return this.enqueue(async () => {
         const cwd = path.resolve(project);
         const useImage = image || this.problemImage;

         if (!useImage) {
            // 退化路径：进程内只读校验（只验证 npm 层覆盖，不验证 postinstall 产物）。
            await this.runPnpm(['fetch', '--offline', '--store-dir', this.cacheDir], { cwd });
            return { ok: true, mode: 'in-process', cacheDir: this.cacheDir, project: cwd };
         }

         const info = await this.imageInfo(useImage);
         const meta = await this.readMeta();
         if (meta?.imageId && meta.imageId !== info.id) {
            throw new Error(
               `缓存已过期：它是用镜像 ${meta.image ?? '?'} (${meta.imageId}) 预热的，` +
                  `当前 ${useImage} 的 digest 是 ${info.id}。请先重新预热（POST /cache/update）。`
            );
         }

         const { exitCode, logs } = await this.runOneShot({
            image: useImage,
            workdir: cwd,
            command: `pnpm install --offline --frozen-lockfile --store-dir ${PROBLEM_CONTAINER_STORE_PATH}`,
            networkMode: 'none',
            storeReadOnly: true,
         });

         return {
            ok: exitCode === 0,
            mode: 'container',
            image: useImage,
            imageId: info.id,
            platform: info.platform,
            network: 'none',
            storeReadOnly: true,
            cacheDir: this.cacheDir,
            project: cwd,
            exitCode,
            logs: exitCode === 0 ? undefined : logs.slice(-4000),
         };
      });
   }

   /** 统计 store 的包数量与体积。 */
   async stats(): Promise<CacheStats> {
      let packages = 0;
      let bytes = 0;

      const walk = async (dir: string): Promise<void> => {
         let entries;
         try {
            entries = await fs.readdir(dir, { withFileTypes: true });
         } catch {
            return;
         }
         for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
               await walk(full);
            } else if (entry.isFile()) {
               const rel = path.relative(this.cacheDir, full);
               const isV10Index =
                  entry.name.endsWith('.json') && rel.split(path.sep).includes('index');
               if (entry.name.endsWith(V9_INDEX_SUFFIX) || isV10Index) packages += 1;
               try {
                  bytes += (await fs.stat(full)).size;
               } catch {
                  // 并发删除等，忽略
               }
            }
         }
      };

      await walk(this.cacheDir);
      return { packages, bytes, cacheDir: this.cacheDir };
   }

   problemContainerMount() {
      return {
         Type: 'bind' as const,
         Source: this.cacheDir,
         Target: PROBLEM_CONTAINER_STORE_PATH,
         ReadOnly: true,
      };
   }
}
