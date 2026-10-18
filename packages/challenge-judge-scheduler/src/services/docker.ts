import Docker from 'dockerode';
import fs from 'node:fs';
import path from 'node:path';
import {
   BACKEND_SERVICE_CONTAINER_IMAGES,
   resolveBackendServiceImageName,
} from '@challenge/shared/backend-service-image';
import { Singleton } from '../utils/singleton';
import { logger } from '../utils/logger';
import { TempFileService } from './temp-file';
import JRTP from '@challenge/judge-machine-agent';
import type z from 'zod';
import type { JudgeResultSchema } from '@challenge/judge-machine-agent/schemas';
import { EventEmitterService } from '../utils/event-emitter';
import { EventType } from '../events/index';
import { ignoreError } from '../utils/ignore-error';
import {
   PnpmCacheService,
   PROBLEM_CONTAINER_STORE_PATH,
} from './pnpm-cache';
import { TimingService } from './timing';

/** 调度器启动阶段的固定计时 ID。 */
const STARTUP_TIMING_ID = 'scheduler-boot';

/** 判题相关容器的资源上限。 */
const numEnv = (key: string, fallback: number) => {
   const raw = process.env[key];
   const parsed = raw ? Number(raw) : NaN;
   return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const LIVE_SERVER_LIMITS = {
   // 进度条/内存上限：静态文件服务，512MB 足够
   memoryBytes: numEnv('LIVE_SERVER_MEMORY_MB', 512) * 1024 * 1024,
   // 约等于 1 个 CPU（与 NanoCpus 用途重叠，二者同时设置更稳妥）
   cpuShares: numEnv('LIVE_SERVER_CPU_SHARES', 512),
   pidsLimit: numEnv('LIVE_SERVER_PIDS_LIMIT', 256),
};

const JUDGE_MACHINE_LIMITS = {
   // 需要同时跑 Chromium 与 Node，给足内存
   memoryBytes: numEnv('JUDGE_MACHINE_MEMORY_MB', 2048) * 1024 * 1024,
   cpuShares: numEnv('JUDGE_MACHINE_CPU_SHARES', 1024),
   pidsLimit: numEnv('JUDGE_MACHINE_PIDS_LIMIT', 512),
};

/** 后端服务容器的资源上限。 */
const BACKEND_SERVICE_LIMITS = {
   memoryBytes: numEnv('BACKEND_SERVICE_MEMORY_MB', 1024) * 1024 * 1024,
   cpuShares: numEnv('BACKEND_SERVICE_CPU_SHARES', 1024),
   pidsLimit: numEnv('BACKEND_SERVICE_PIDS_LIMIT', 256),
};

/** 后端判题机的资源上限：无 Chromium，比前端判题机小一号。 */
const BACKEND_JUDGE_MACHINE_LIMITS = {
   memoryBytes: numEnv('BACKEND_JUDGE_MACHINE_MEMORY_MB', 1024) * 1024 * 1024,
   cpuShares: numEnv('BACKEND_JUDGE_MACHINE_CPU_SHARES', 1024),
   pidsLimit: numEnv('BACKEND_JUDGE_MACHINE_PIDS_LIMIT', 256),
};

/** 前端（Playwright）判题机镜像。 */
const JUDGE_MACHINE_IMAGE = 'challenge-judge-machine-agent';

/** 后端判题机镜像。 */
const BACKEND_JUDGE_MACHINE_IMAGE = 'challenge-backend-judge-machine-agent';

/** 判断 Docker 抛出的错误是不是「镜像不存在」。 */
const isImageMissingError = (error: any): boolean => {
   const message = String(error?.message ?? error ?? '');
   return /no such image/i.test(message) || (error?.statusCode === 404 && /image/i.test(message));
};

/** 前端判题机镜像缺失时的构建提示（多处复用，避免再出现指错脚本的老问题）。 */
const JUDGE_MACHINE_BUILD_HINT =
   '请先构建镜像：pnpm --filter @challenge/judge-machine-agent docker:build';

/** 会被清扫的「题目容器」镜像（后端侧从注册表派生，避免新镜像泄漏容器）。 */
const PROBLEM_CONTAINER_IMAGES = [
   'challenge-live-server-agent',
   ...BACKEND_SERVICE_CONTAINER_IMAGES,
];

export class DockerService extends Singleton {
   static get instance() {
      return this.getInstance<DockerService>();
   }

   private constructor(
      public readonly docker = new Docker(),
      public readonly networkName = 'orange-network',
      public liveServerStartTimeout = 10 * 1000,
      /** 后端服务容器就绪超时。 */
      public backendServiceStartTimeout = Number(
         process.env.BACKEND_SERVICE_START_TIMEOUT_MS ?? 90 * 1000
      ),
      public judgeMachineWs: WebSocket | null = null,
      public judgeMachineContainer: Docker.Container | null = null,
      // 后端判题机懒加载：没有后端题目的部署不需要构建这个镜像，故不能放进 init()。
      public backendJudgeMachineWs: WebSocket | null = null,
      public backendJudgeMachineContainer: Docker.Container | null = null
   ) {
      super();
   }

   /** 前端判题机的可用性快照，供 `/health` 与启动日志使用。 */
   public judgeMachine = {
      available: false,
      reason: '尚未初始化',
   } as { available: boolean; reason?: string };

   private activeLiveServerIds = new Set<string>();

   /** 定时清扫句柄；用 unref 避免它把进程留在事件循环里。 */
   private sweepTimer: NodeJS.Timeout | null = null;

   startLiveServerSweeper(intervalMs = 30_000, graceMs = 5 * 60 * 1000) {
      if (this.sweepTimer) return;
      this.sweepTimer = setInterval(() => {
         void this.sweepStaleLiveServers({ minAgeMs: graceMs });
      }, intervalMs);
      this.sweepTimer.unref?.();
      logger.info(
         `Live-server sweeper started (every ${intervalMs / 1000}s, grace ${graceMs / 1000}s)`
      );
   }

   stopLiveServerSweeper() {
      if (!this.sweepTimer) return;
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
   }

   async init() {
      try {
         // 检查网络是否已存在
         const existingNetworks = await this.docker.listNetworks({
            filters: { name: [this.networkName] },
         });

         if (existingNetworks.length === 0) {
            const network = await this.docker.createNetwork({
               Name: this.networkName,
               CheckDuplicate: true,
               Driver: 'bridge',
            });
            logger.info(
               { 'quanta.judge.network_id': network.id },
               `Created network: ${network.id}`
            );
         } else {
            logger.info(`Network ${this.networkName} already exists`);
         }
      } catch (error) {
         logger.error({ err: error }, 'Error creating network');
      }

      // 不能在建网后提前 return，否则全新环境下判题机永远不会启动。
      try {
         const result = await TimingService.instance.measure(
            STARTUP_TIMING_ID,
            '启动前端判题机容器',
            () => this.startPlaywrightContainer(),
         );
         this.judgeMachineWs = result.ws;
         this.judgeMachineContainer = result.container;
         this.judgeMachine = { available: true };

         logger.info(
            { 'quanta.judge.container_id': result.containerId },
            'Judge machine container started',
         );
      } catch (error: any) {
         const imageMissing = isImageMissingError(error);
         const optional = process.env.JUDGE_MACHINE_OPTIONAL === '1';

         if (imageMissing || optional) {
            const cause = imageMissing ? '缺镜像' : 'JUDGE_MACHINE_OPTIONAL=1';

            this.judgeMachine = {
               available: false,
               reason: imageMissing ? `前端判题机镜像 ${JUDGE_MACHINE_IMAGE} 不存在` : error.message,
            };
            logger.warn(
               { err: error },
               `前端判题机未启动，调度器降级运行（${cause}）：${error.message}\n` +
                  '       影响：前端题型提交后会以 "Judge machine WebSocket is not connected" 失败，' +
                  '后端服务题型不受影响；/health 现在会返回 status=degraded。',
            );
            return;
         }

         throw new Error(
            `[ERROR] Failed to start Playwright container: ${error.message}\n` +
               '       若这个环境本来就不跑前端题型，可设 JUDGE_MACHINE_OPTIONAL=1 降级为告警。',
         );
      }
   }

   async startLiveServerContainer(
      fsSnapshot: Record<string, string>,
      timingId: string
   ) {
      const timer = TimingService.instance;
      const { fsName, fsRootPath } = await timer.measure(
         timingId,
         '恢复项目快照',
         () => TempFileService.instance.restoreFileSystem(fsSnapshot)
      );

      const createContainer = async () => {
         const container = await this.docker.createContainer({
            Image: 'challenge-live-server-agent',
            HostConfig: {
               Mounts: [
                  {
                     Type: 'bind',
                     Source: fsRootPath,
                     Target: '/app',
                     ReadOnly: false,
                  },
               ],
               AutoRemove: true,
               // 资源上限：防止用户代码耗尽宿主机资源
               Memory: LIVE_SERVER_LIMITS.memoryBytes,
               MemorySwap: LIVE_SERVER_LIMITS.memoryBytes,
               CpuShares: LIVE_SERVER_LIMITS.cpuShares,
               PidsLimit: LIVE_SERVER_LIMITS.pidsLimit,
            },
            NetworkingConfig: {
               EndpointsConfig: {
                  [this.networkName]: {
                     Aliases: [fsName],
                  },
               },
            },
         });

         const startProcess = await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
         });
         await container.start();
         // 立刻登记为"使用中"，否则清扫器会在登记前的窗口把它当孤儿删掉。
         this.activeLiveServerIds.add(container.id);

         let readyTimeout: ReturnType<typeof setTimeout> | undefined;
         const waitForReady = new Promise<void>((resolve, reject) => {
            let hasReady = false;

            // 设置超时，防止容器长时间未响应
            readyTimeout = setTimeout(() => {
               if (hasReady) return;
               reject(new Error('Container did not start in time'));
               this.activeLiveServerIds.delete(container.id);
               // 用 remove 而非 stop：AutoRemove 下二者会竞争，force 保证容器确实被回收。
               ignoreError(() => container.remove({ force: true }));
            }, this.liveServerStartTimeout);

            const onData = (data: Buffer) => {
               const output: string = data.toString();
               if (output.includes('Ready')) {
                  hasReady = true;
                  clearTimeout(readyTimeout);
                  resolve();
                  startProcess.off('data', onData);
               }
            };

            startProcess.on('data', onData);
         });
         // 就绪信号可能不被消费，此处兜底
         waitForReady.catch(() => {});

         return {
            startProcess,
            containerId: container.id,
            fsName,
            fsRootPath,
            container,
            waitForReady,
            networkUrl: `http://${fsName}:3000`,
            close: async () => {
               // 先注销再做清理：否则清扫器可能在本容器仍被登记时反复尝试删除。
               this.activeLiveServerIds.delete(container.id);
               clearTimeout(readyTimeout);
               await ignoreError(() => container.remove({ force: true }));
               await TempFileService.instance.cleanup(fsRootPath);
            },
         };
      };

      try {
         const result = await timer.measure(
            timingId,
            '创建 live-server 容器',
            createContainer
         );
         // 容器在创建过程中（container.start() 之后）就已登记，这里不再重复登记。
         return result;
      } catch (error) {
         logger.error({ err: error }, 'Error starting live server container');
         // 兜底：createContainer 任何一步失败都必须删掉容器，否则集中提交时会堆积大量容器。
         await this.removeLiveServersWithAliasPrefix(
            'challenge-live-server-agent',
            fsName,
         );
         await TempFileService.instance.cleanup(fsRootPath);
         throw error;
      }
   }

   /** 删除指定网络别名对应的残留 live-server 容器（startLiveServerContainer 失败兜底，此时拿不到容器句柄）。 */
   private async removeLiveServersWithAliasPrefix(image: string, fsName: string) {
      await ignoreError(async () => {
         const containers = await this.listContainersByImage(image);
         for (const info of containers) {
            if (this.activeLiveServerIds.has(info.Id)) continue;
            const aliases = Object.values(info.NetworkSettings?.Networks ?? {})
               .flatMap((n) => n.Aliases ?? []);
            if (!aliases.includes(fsName)) continue;
            logger.info(
               { 'quanta.judge.container_id': info.Id },
               `Removing leftover live-server container ${info.Id.slice(0, 12)} (alias ${fsName})`,
            );
            await ignoreError(() =>
               this.docker.getContainer(info.Id).remove({ force: true }),
            );
         }
      });
   }

   /** 按镜像名查找容器；不能用 ancestor 过滤（镜像重建后旧容器变 dangling 匹配不到），按"镜像名 + 端口绑定"双重匹配。 */
   private async listContainersByImage(imageName: string) {
      const [byAncestor, all] = await Promise.all([
         ignoreError(() =>
            this.docker.listContainers({
               all: true,
               filters: { ancestor: [imageName] },
            }),
         ).then((r) => r ?? []),
         // 必须带 all: true，默认只列运行中容器，扫不到已退出的泄漏容器。
         this.docker.listContainers({ all: true }),
      ]);

      const ids = new Set(byAncestor.map((c) => c.Id));
      for (const c of all) {
         const name = c.Image ?? '';
         if (name === imageName || name.startsWith(imageName + ':')) {
            ids.add(c.Id);
         }
      }

      return all.filter((c) => ids.has(c.Id));
   }

   /** 清理残留的 live-server 容器（job 失败、强杀或启动失败时可能泄漏）；以 activeLiveServerIds 而非容器年龄判断泄漏，minAgeMs 仅启动兜底用。 */
   async sweepStaleLiveServers(options?: { minAgeMs?: number }) {
      const minAgeMs = options?.minAgeMs ?? 5 * 60 * 1000;
      const nowSec = Date.now() / 1000;
      let removed = 0;

      // 同时清扫前端 live-server 与后端服务容器：二者都可能因 job 失败或强杀而泄漏。
      for (const image of PROBLEM_CONTAINER_IMAGES) {
         try {
            const containers = await this.listContainersByImage(image);

            for (const info of containers) {
               if (this.activeLiveServerIds.has(info.Id)) continue;
               const ageMs = (nowSec - info.Created) * 1000;
               if (ageMs < minAgeMs) continue;

               logger.info(
                  { 'quanta.judge.container_id': info.Id },
                  `Removing stale problem container ${info.Id.slice(0, 12)} (image ${image}, age ${Math.round(ageMs / 1000)}s)`,
               );
               const ok = await ignoreError(() =>
                  this.docker.getContainer(info.Id).remove({ force: true }),
               );
               if (ok !== null) removed++;
            }
         } catch (error) {
            logger.error(
               { err: error },
               `Failed to sweep stale ${image} containers`,
            );
         }
      }

      if (removed > 0) {
         logger.info(
            `Swept ${removed} stale problem container(s), ${this.activeLiveServerIds.size} still active`,
         );
      }
   }

   async startPlaywrightContainer() {
      const imageName = JUDGE_MACHINE_IMAGE;
      let container: Docker.Container;

      const [byImage, byPort] = await Promise.all([
         this.listContainersByImage(imageName),
         ignoreError(() =>
            this.docker.listContainers({
               all: true,
               filters: { publish: ['1889'] },
            }),
         ).then((r) => r ?? []),
      ]);
      const candidates = [...byImage, ...byPort].filter(
         (c) => c.State === 'running',
      );

      const reusable =
         candidates.find((c) => c.Ports?.some((p) => p.PublicPort === 1889)) ??
         candidates[0];

      if (reusable) {
         const containerId = reusable.Id;
         logger.info(
            { 'quanta.judge.container_id': containerId },
            `Using existing container ${containerId} with image ${imageName}`,
         );
         container = this.docker.getContainer(containerId);
      } else {
         // 镜像不存在时 dockerode 报错不明确，这里补成可执行的提示。
         try {
            container = await this.docker.createContainer({
               Image: imageName,
               HostConfig: {
                  AutoRemove: true,
                  // 资源上限：判题机常驻运行 Chromium，避免其无限制占用宿主机
                  Memory: JUDGE_MACHINE_LIMITS.memoryBytes,
                  MemorySwap: JUDGE_MACHINE_LIMITS.memoryBytes,
                  CpuShares: JUDGE_MACHINE_LIMITS.cpuShares,
                  PidsLimit: JUDGE_MACHINE_LIMITS.pidsLimit,
                  PortBindings: {
                     '3000/tcp': [{ HostPort: '1889' }],
                  },
               },
               ExposedPorts: {
                  '3000/tcp': {},
               },
               NetworkingConfig: {
                  EndpointsConfig: {
                     [this.networkName]: {
                        Aliases: ['judge-machine'],
                     },
                  },
               },
            });
         } catch (error: any) {
            // 区分「镜像没构建」与「镜像在但起不来」：前者该建议构建，后者不是。
            const detail = String(error?.message ?? error)
               .replace(/\s+/g, ' ')
               .trim();
            throw new Error(
               isImageMissingError(error)
                  ? `前端判题机镜像 ${imageName} 不存在：${detail}。${JUDGE_MACHINE_BUILD_HINT}`
                  : `前端判题机容器启动失败：${detail}`,
            );
         }

         const startProcess = await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
         });

         await container.start();
         await new Promise<void>((resolve, reject) => {
            let hasReady = false;

            // 设置超时，防止容器长时间未响应
            setTimeout(() => {
               if (hasReady) return;
               reject(new Error('Container did not start in time'));
               ignoreError(() => container.stop());
            }, this.liveServerStartTimeout);

            const onData = (data: Buffer) => {
               const output: string = data.toString();
               if (output.includes('Server is running')) {
                  hasReady = true;
                  resolve();
                  startProcess.off('data', onData);
               }
            };

            startProcess.on('data', onData);
         });
      }

      const ws = await this.connectWebSocket(
         process.env.JUDGE_MACHINE_WS_URL ?? 'ws://localhost:1889/link'
      );

      return {
         containerId: container.id,
         container,
         ws,
      };
   }

  async connectWebSocket(wsUrl: string) {
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve) => {
         ws.addEventListener('open', () => {
            resolve();

            // 定时发送心跳包，保持连接活跃
            const timer = setInterval(() => {
               ws.send('ping');
            }, 30 * 1000);

            ws.addEventListener('close', () => {
               clearInterval(timer);
            });
         });
      });

      const jrtp = new JRTP();
      type JudgeResultType = z.infer<typeof JudgeResultSchema>;
      ws.addEventListener('message', async (event) => {
         const raw = event.data as unknown;
         const buffer = Buffer.isBuffer(raw)
            ? raw
            : raw instanceof ArrayBuffer
              ? Buffer.from(raw)
              : Buffer.from(await (raw as Blob).arrayBuffer());
         const data = jrtp.unpack(buffer) as JudgeResultType;
         EventEmitterService.instance.emit(EventType.JUDGE_FINISHED, data);
      });

      return ws;
   }

   /** 确保后端判题机容器已就绪，并返回它的 WebSocket。 */
   async ensureBackendJudgeMachine(): Promise<WebSocket> {
      if (
         this.backendJudgeMachineWs &&
         this.backendJudgeMachineWs.readyState === WebSocket.OPEN
      ) {
         return this.backendJudgeMachineWs;
      }

      const imageName = BACKEND_JUDGE_MACHINE_IMAGE;
      let container: Docker.Container;

      const candidates = (await this.listContainersByImage(imageName)).filter(
         (c) => c.State === 'running'
      );
      const reusable =
         candidates.find((c) => c.Ports?.some((p) => p.PublicPort === 1891)) ??
         candidates[0];

      if (reusable) {
         logger.info(
            { 'quanta.judge.container_id': reusable.Id },
            `Using existing backend judge machine ${reusable.Id.slice(0, 12)}`
         );
         container = this.docker.getContainer(reusable.Id);
      } else {
         try {
            container = await this.docker.createContainer({
               Image: imageName,
               HostConfig: {
                  AutoRemove: true,
                  Memory: BACKEND_JUDGE_MACHINE_LIMITS.memoryBytes,
                  MemorySwap: BACKEND_JUDGE_MACHINE_LIMITS.memoryBytes,
                  CpuShares: BACKEND_JUDGE_MACHINE_LIMITS.cpuShares,
                  PidsLimit: BACKEND_JUDGE_MACHINE_LIMITS.pidsLimit,
                  PortBindings: {
                     '3000/tcp': [{ HostPort: '1891' }],
                  },
               },
               ExposedPorts: { '3000/tcp': {} },
               NetworkingConfig: {
                  EndpointsConfig: {
                     [this.networkName]: {
                        Aliases: ['backend-judge-machine'],
                     },
                  },
               },
            });
         } catch (error: any) {
            throw new Error(
               `后端判题机镜像 ${imageName} 不可用：${error?.message ?? error}。` +
                  '请先执行 pnpm --filter @challenge/backend-judge-machine-agent docker:build'
            );
         }

         const startProcess = await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
         });

         await container.start();
         await new Promise<void>((resolve, reject) => {
            let hasReady = false;
            setTimeout(() => {
               if (hasReady) return;
               reject(new Error('Backend judge machine did not start in time'));
               ignoreError(() => container.stop());
            }, this.liveServerStartTimeout);

            const onData = (data: Buffer) => {
               const output = data.toString();
               if (output.includes('Backend judge machine is running')) {
                  hasReady = true;
                  resolve();
                  startProcess.off('data', onData);
               }
            };
            startProcess.on('data', onData);
         });
      }

      const wsUrl =
         process.env.BACKEND_JUDGE_MACHINE_WS_URL ??
         'ws://localhost:1891/link';
      const ws = await this.connectWebSocket(wsUrl);
      this.backendJudgeMachineWs = ws;
      this.backendJudgeMachineContainer = container;
      return ws;
   }

   /** 启动一个后端服务容器。 */
   async startBackendServiceContainer(options: {
      fsSnapshot: Record<string, string>;
      image?: string;
      port?: number;
      startCommand?: string;
      judgeUploadPath?: string;
      timingId: string;
   }) {
      const timer = TimingService.instance;
      const { timingId } = options;
      const image = resolveBackendServiceImageName(options.image);
      const port = options.port ?? 3000;
      const judgeUploadPath = options.judgeUploadPath || 'project';
      const startCommand = options.startCommand || '';
      const appDir = path.posix.join('/app', judgeUploadPath);

      const { fsName, fsRootPath } = await timer.measure(
         timingId,
         '恢复项目快照',
         () => TempFileService.instance.restoreFileSystem(options.fsSnapshot)
      );
      const projectDir = path.join(fsRootPath, judgeUploadPath);

      try {
         const hasLockfile = fs.existsSync(
            path.join(projectDir, 'pnpm-lock.yaml')
         );
         if (hasLockfile) {
            await timer.measure(timingId, '预热 pnpm 缓存', () =>
               PnpmCacheService.instance.update({
                  source: 'external',
                  project: projectDir,
                  image,
               })
            );
         } else {
            logger.warn(
               `后端题目缺少 pnpm-lock.yaml（${projectDir}），跳过缓存预热；` +
                  '容器内也将跳过离线安装。无法离线安装的题目在断网环境下不可复现。'
            );
         }

         timer.start(timingId, '创建后端服务容器');
         const container = await this.docker.createContainer({
            Image: image,
            Env: [
               `QUANTA_APP_DIR=${appDir}`,
               `QUANTA_PORT=${port}`,
               `QUANTA_START_COMMAND=${startCommand}`,
               `QUANTA_STORE_DIR=${PROBLEM_CONTAINER_STORE_PATH}`,
            ],
            HostConfig: {
               Mounts: [
                  {
                     Type: 'bind',
                     Source: fsRootPath,
                     Target: '/app',
                     ReadOnly: false,
                  },
                  PnpmCacheService.instance.problemContainerMount(),
               ],
               AutoRemove: true,
               Memory: BACKEND_SERVICE_LIMITS.memoryBytes,
               MemorySwap: BACKEND_SERVICE_LIMITS.memoryBytes,
               CpuShares: BACKEND_SERVICE_LIMITS.cpuShares,
               PidsLimit: BACKEND_SERVICE_LIMITS.pidsLimit,
            },
            ExposedPorts: { [`${port}/tcp`]: {} },
            NetworkingConfig: {
               EndpointsConfig: {
                  [this.networkName]: {
                     Aliases: [fsName],
                  },
               },
            },
         });

         const startProcess = await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
         });
         await container.start();
         timer.end(timingId, '创建后端服务容器');
         this.activeLiveServerIds.add(container.id);

         let collectedLogs = '';
         const waitForReady = new Promise<void>((resolve, reject) => {
            let hasReady = false;
            const timer = setTimeout(() => {
               if (hasReady) return;
               reject(
                  new Error(
                     `后端服务在 ${this.backendServiceStartTimeout / 1000}s 内未就绪。` +
                        `容器日志尾部：\n${collectedLogs.slice(-2000)}`
                  )
               );
               this.activeLiveServerIds.delete(container.id);
               ignoreError(() => container.remove({ force: true }));
            }, this.backendServiceStartTimeout);

            const onData = (data: Buffer) => {
               const output = data.toString();
               collectedLogs += output;
               if (output.includes('[quanta] Ready')) {
                  hasReady = true;
                  clearTimeout(timer);
                  resolve();
                  startProcess.off('data', onData);
               }
            };
            startProcess.on('data', onData);
         });

         return {
            containerId: container.id,
            fsName,
            fsRootPath,
            container,
            waitForReady,
            networkUrl: `http://${fsName}:${port}`,
            close: async () => {
               this.activeLiveServerIds.delete(container.id);
               await ignoreError(() => container.remove({ force: true }));
               await TempFileService.instance.cleanup(fsRootPath);
            },
         };
      } catch (error) {
         logger.error({ err: error }, 'Error starting backend service container');
         await this.removeLiveServersWithAliasPrefix(image, fsName);
         await TempFileService.instance.cleanup(fsRootPath);
         throw error;
      }
   }

   async destroy() {
      try {
         const containers = await this.docker.listContainers({
            all: true,
            filters: { network: [this.networkName] },
         });

         for (const containerInfo of containers) {
            const container = this.docker.getContainer(containerInfo.Id);
            ignoreError(() => container.stop());
         }

         const networks = await this.docker.listNetworks({
            filters: { name: [this.networkName] },
         });

         for (const network of networks) {
            await this.docker.getNetwork(network.Id).remove();
         }
      } catch (error) {
         logger.error({ err: error }, 'Error during DockerService cleanup');
      }
   }
}
