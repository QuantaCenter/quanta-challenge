import Docker from 'dockerode';
import fs from 'node:fs';
import path from 'node:path';
import {
   BACKEND_SERVICE_CONTAINER_IMAGES,
   resolveBackendServiceImageName,
} from '@challenge/shared/backend-service-image';
import { Singleton } from '../utils/singleton';
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

/**
 * 判题相关容器的资源上限。
 *
 * 用户提交的代码会在 live-server 容器里执行，之前这些容器没有任何 CPU / 内存 / 进程数
 * 限制：一段 while(true) 或 fork 炸弹就能把宿主机拖垮，影响同机器上的所有判题与其他服务。
 * 这里给出保守但足够的上限，可通过环境变量覆盖以便在更强/更弱的机器上调整。
 */
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

/**
 * 后端服务容器的资源上限。
 *
 * 用户代码是一个常驻进程，比静态文件的 live-server 危险得多（死循环 / 内存泄漏 /
 * fork 炸弹都会长期占着资源），因此这里显式设上限，可通过环境变量覆盖。
 */
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

/**
 * 判断 Docker 抛出的错误是不是「镜像不存在」。
 *
 * 镜像没构建时 dockerode 在 createContainer 阶段抛出的是：
 *   (HTTP code 404) no such container - No such image: challenge-judge-machine-agent:latest
 * 文案里既有 "container" 又有 "image"，与「容器跑不起来」这类真故障必须区分开，
 * 否则调度器会把「镜像可选未构建」当成环境损坏（详见 init()）。
 */
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
      /**
       * 后端服务容器就绪超时。
       *
       * 明显大于 live-server 的 10s：后端容器启动时要先做一次离线 `pnpm install`，
       * 依赖树较大时 10s 根本不够。90s 覆盖「安装 + 服务冷启动」。
       */
      public backendServiceStartTimeout = Number(
         process.env.BACKEND_SERVICE_START_TIMEOUT_MS ?? 90 * 1000
      ),
      public judgeMachineWs: WebSocket | null = null,
      public judgeMachineContainer: Docker.Container | null = null,
      // 后端判题机懒加载：没有后端题目的部署不需要构建这个镜像，
      // 因此不能放进 init()（那样会让所有存量部署因为一个用不到的镜像而启动失败）。
      public backendJudgeMachineWs: WebSocket | null = null,
      public backendJudgeMachineContainer: Docker.Container | null = null
   ) {
      super();
   }

   /**
    * 前端判题机的可用性快照，供 `/health` 与启动日志使用。
    *
    * 缺镜像时调度器会「降级启动」而不是直接退出（理由见 init()），但降级绝不能是
    * 静默的：它必须同时出现在启动 WARN 与 /health 里，否则就又回到
    * 「服务看着是好的、前端判题全挂」那个陷阱。
    */
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
      console.log(
         `[INFO] Live-server sweeper started (every ${intervalMs / 1000}s, grace ${graceMs / 1000}s)`
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
            console.log('[INFO] Created network:', network.id);
         } else {
            console.log(`[INFO] Network ${this.networkName} already exists`);
         }
      } catch (error) {
         console.error('[ERROR] Error creating network:', error);
      }

      // 注意：不能在建网后提前 return，否则全新环境下判题机永远不会启动，
      // 所有判题任务都会以 "Judge machine WebSocket is not connected" 失败。
      try {
         const result = await TimingService.instance.measure(
            STARTUP_TIMING_ID,
            '启动前端判题机容器',
            () => this.startPlaywrightContainer(),
         );
         this.judgeMachineWs = result.ws;
         this.judgeMachineContainer = result.container;
         this.judgeMachine = { available: true };

         console.log(
            '[INFO] Judge machine container started:',
            result.containerId,
         );
      } catch (error: any) {
         // 两种「降级启动」，其余错误仍然 fail-fast：
         //
         // 1. 镜像不存在（no such image）—— 这是「这个环境不跑前端题型」，而不是环境坏了。
         //    后端服务题型只需要 backend-service-agent / backend-judge-machine-agent，
         //    而这台机器上很可能从没构建过带 Playwright 的前端判题机镜像（体积大、构建慢）。
         //    此时让整个调度器退出，等于「一个用不到的镜像把后端判题也一起废掉」——
         //    与 ensureBackendJudgeMachine() 对后端判题机的懒加载策略自相矛盾。
         //    降级后前端任务仍会以明确错误失败（judge-processor: "Judge machine
         //    WebSocket is not connected"），不会静默挂起，且 /health 会报 degraded。
         //
         // 2. JUDGE_MACHINE_OPTIONAL=1 —— 明知不要前端判题时的显式选择，
         //    也用于绕过「1889 端口被占 / 容器起不来」这类没必要阻塞后端的错误。
         const imageMissing = isImageMissingError(error);
         const optional = process.env.JUDGE_MACHINE_OPTIONAL === '1';

         if (imageMissing || optional) {
            const cause = imageMissing ? '缺镜像' : 'JUDGE_MACHINE_OPTIONAL=1';

            this.judgeMachine = {
               available: false,
               reason: imageMissing ? `前端判题机镜像 ${JUDGE_MACHINE_IMAGE} 不存在` : error.message,
            };
            console.warn(
               `[WARN] 前端判题机未启动，调度器降级运行（${cause}）：${error.message}\n` +
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
         // 立刻登记为"使用中"，不能等 waitForReady 之后再登记：
         // 否则在"容器已存在但尚未登记"的窗口里，定时清扫器会把它当孤儿删掉，
         // 判题机随即解析不到该容器的网络别名（ERR_NAME_NOT_RESOLVED），
         // 最终以 "Judge Machine response timeout" 失败。
         this.activeLiveServerIds.add(container.id);

         const waitForReady = new Promise<void>((resolve, reject) => {
            let hasReady = false;

            // 设置超时，防止容器长时间未响应
            setTimeout(() => {
               if (hasReady) return;
               reject(new Error('Container did not start in time'));
               this.activeLiveServerIds.delete(container.id);
               // 用 remove 而非 stop：容器带 AutoRemove，stop 触发的自动删除与显式删除
               // 会互相竞争，容易只删掉一半；force 能保证容器确实被回收。
               ignoreError(() => container.remove({ force: true }));
            }, this.liveServerStartTimeout);

            const onData = (data: Buffer) => {
               const output: string = data.toString();
               if (output.includes('Ready')) {
                  hasReady = true;
                  resolve();
                  startProcess.off('data', onData);
               }
            };

            startProcess.on('data', onData);
         });

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
         console.error('Error starting live server container:', error);
         // 兜底：createContainer 内部任何一步失败（attach / start / waitForReady / 之后的异常）
         // 都必须把容器删掉。实测中漏掉这一步会在集中提交时迅速堆积出上百个容器。
         await this.removeLiveServersWithAliasPrefix(
            'challenge-live-server-agent',
            fsName,
         );
         await TempFileService.instance.cleanup(fsRootPath);
         throw error;
      }
   }

   /**
    * 删除指定网络别名对应的残留 live-server 容器。
    *
    * 用于 startLiveServerContainer 失败后的兜底清理：此时可能拿不到 container 句柄
    * （例如 createContainer 中途抛出），只能按别名反查。
    */
   private async removeLiveServersWithAliasPrefix(image: string, fsName: string) {
      await ignoreError(async () => {
         const containers = await this.listContainersByImage(image);
         for (const info of containers) {
            if (this.activeLiveServerIds.has(info.Id)) continue;
            const aliases = Object.values(info.NetworkSettings?.Networks ?? {})
               .flatMap((n) => n.Aliases ?? []);
            if (!aliases.includes(fsName)) continue;
            console.log(
               `[INFO] Removing leftover live-server container ${info.Id.slice(0, 12)} (alias ${fsName})`,
            );
            await ignoreError(() =>
               this.docker.getContainer(info.Id).remove({ force: true }),
            );
         }
      });
   }

   /**
    * 按镜像名查找运行中的容器。
    *
    * 不能用 `listContainers({ filters: { ancestor: [tag] } })`：一旦镜像被重建，
    * 旧容器引用的镜像 ID 变成 dangling，ancestor=<tag> 就再也匹配不到它。
    * 后果是调度器以为"没有旧容器"，于是尝试再创建一个并绑定 1889 端口，
    * 直接失败（Bind for 0.0.0.0:1889 failed: port is already allocated）。
    * 因此这里按"镜像名 + 端口绑定"双重匹配。
    */
   private async listContainersByImage(imageName: string) {
      const [byAncestor, all] = await Promise.all([
         ignoreError(() =>
            this.docker.listContainers({
               all: true,
               filters: { ancestor: [imageName] },
            }),
         ).then((r) => r ?? []),
         // 必须带 all: true。默认只列"运行中"容器，而泄漏的 live-server 容器
         // 往往是已退出/创建后未启动的状态，用默认查询根本扫不到它们。
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

   /**
    * 清理残留的 live-server 容器。
    *
    * 正常路径由 judge-processor 调用 close() 回收；但 job 失败、调度器被强杀、
    * 或 startLiveServerContainer 中途失败时都可能漏掉，容器会一直占着内存与网络别名。
    *
    * 判断依据是 activeLiveServerIds 而不是容器年龄：
    * 实测一次集中提交会在十几秒内建出上百个同龄容器，用年龄阈值无法区分
    * "还在用"与"已泄漏"，且 5 分钟阈值对突发积压完全无效（积压时每秒都在新建）。
    *
    * @param minAgeMs 仅启动时兜底用（默认 5 分钟，避免误删上一次进程遗留但仍在使用的容器）；
    *                 定时清扫传 0，因为未被登记的容器一定是孤儿。
    */
   async sweepStaleLiveServers(options?: { minAgeMs?: number }) {
      const minAgeMs = options?.minAgeMs ?? 5 * 60 * 1000;
      const nowSec = Date.now() / 1000;
      let removed = 0;

      // 同时清扫前端 live-server 与后端服务容器：两者都会因为 job 失败 /
      // 调度器被强杀而泄漏，且都不会自动消失（AutoRemove 只在正常 remove 时生效）。
      for (const image of PROBLEM_CONTAINER_IMAGES) {
         try {
            const containers = await this.listContainersByImage(image);

            for (const info of containers) {
               if (this.activeLiveServerIds.has(info.Id)) continue;
               const ageMs = (nowSec - info.Created) * 1000;
               if (ageMs < minAgeMs) continue;

               console.log(
                  `[INFO] Removing stale problem container ${info.Id.slice(0, 12)} (image ${image}, age ${Math.round(ageMs / 1000)}s)`,
               );
               const ok = await ignoreError(() =>
                  this.docker.getContainer(info.Id).remove({ force: true }),
               );
               if (ok !== null) removed++;
            }
         } catch (error) {
            console.error(
               `[ERROR] Failed to sweep stale ${image} containers:`,
               error,
            );
         }
      }

      if (removed > 0) {
         console.log(
            `[INFO] Swept ${removed} stale problem container(s), ${this.activeLiveServerIds.size} still active`,
         );
      }
   }

   async startPlaywrightContainer() {
      const imageName = JUDGE_MACHINE_IMAGE;
      let container: Docker.Container;

      // 优先复用已占着 1889 端口 / 同名镜像的容器。
      //
      // 只按镜像名匹配不够：镜像名被重新指向新镜像（重新发布）后，旧容器在列表里就只剩
      // 镜像 ID（`ancestor=` 也匹配不到），于是会误判为「无旧容器」并重复绑定 1889，
      // 调度器启动即失败。端口是独占资源，占着 1889 的必然是旧判题机，故再按端口兜底查一次。
      //
      // listContainersByImage 会连已退出的容器一起返回（清扫需要），
      // 但这里只能复用**正在运行**的，否则会把已退出的容器当成判题机去连 WebSocket。
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
         console.log(
            `[INFO] Using existing container ${containerId} with image ${imageName}`,
         );
         container = this.docker.getContainer(containerId);
      } else {
         // 镜像不存在时 dockerode 只给一句
         //   (HTTP code 404) no such container - No such image: challenge-judge-machine-agent:latest
         // 既不说是哪个包、也不说怎么修。这里补成可执行的提示（与后端判题机同一写法）。
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
         // 使用 Web 标准事件接口（Node 22 内置全局 WebSocket），
         // event.data 可能是 Buffer/ArrayBuffer/Blob，统一归一化为 Buffer。
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

   /**
    * 确保后端判题机容器已就绪，并返回它的 WebSocket。
    *
    * 懒加载的理由见构造函数注释：只有存在后端题目的部署才需要这个镜像。
    * 镜像缺失时异常只会在这一次后端判题里抛出，不影响前端判题。
    */
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
         console.log(
            `[INFO] Using existing backend judge machine ${reusable.Id.slice(0, 12)}`
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

   /**
    * 启动一个后端服务容器。
    *
    * 顺序是硬约束（见 docs/BACKEND_SERVICE_PROBLEM.md §1）：
    *   ① 恢复快照到临时目录
    *   ② 用题目镜像热更新共享 pnpm 缓存（联网，可复用的是缓存不是安装结果）
    *   ③ 启动容器，容器内用【只读 store】【离线】安装，再跑题目自定义启动命令
    *   ④ 等容器打印 `[quanta] Ready`
    *
    * 为什么②必须走 PnpmCacheService（而不是在容器里直接联网装）：
    * 缓存是跨判题共享的，预热一次后续判题都命中；而消费端（③）永远离线，
    * 保证「判题时依赖 = 审计时依赖」，不会因为 registry 抖动而随机变少。
    */
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
         // ② 热更新缓存：这就是「调用特定 API 更新缓存库」——HTTP 侧入口是
         //    POST /cache/update，这里进程内直接调用同一个服务。
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
            console.warn(
               `[WARN] 后端题目缺少 pnpm-lock.yaml（${projectDir}），跳过缓存预热；` +
                  '容器内也将跳过离线安装。无法离线安装的题目在断网环境下不可复现。'
            );
         }

         // ③ 启动服务容器
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
               // 入口脚本的固定就绪信号（entrypoint.sh），格式不要改。
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
         console.error('Error starting backend service container:', error);
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
         console.error('Error during DockerService cleanup:', error);
      }
   }
}
