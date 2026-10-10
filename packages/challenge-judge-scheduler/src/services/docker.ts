import Docker from 'dockerode';
import { Singleton } from '../utils/singleton';
import { TempFileService } from './temp-file';
import JRTP from '@challenge/judge-machine-agent';
import type z from 'zod';
import type { JudgeResultSchema } from '@challenge/judge-machine-agent/schemas';
import { EventEmitterService } from '../utils/event-emitter';
import { EventType } from '../events/index';
import { ignoreError } from '../utils/ignore-error';

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

export class DockerService extends Singleton {
   static get instance() {
      return this.getInstance<DockerService>();
   }

   private constructor(
      public readonly docker = new Docker(),
      public readonly networkName = 'orange-network',
      public liveServerStartTimeout = 10 * 1000,
      public judgeMachineWs: WebSocket | null = null,
      public judgeMachineContainer: Docker.Container | null = null
   ) {
      super();
   }

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
         const result = await this.startPlaywrightContainer();
         this.judgeMachineWs = result.ws;
         this.judgeMachineContainer = result.container;

         console.log(
            '[INFO] Judge machine container started:',
            result.containerId,
         );
      } catch (error: any) {
         throw new Error(
            `[ERROR] Failed to start Playwright container: ${error.message}`,
         );
      }
   }

   async startLiveServerContainer(fsSnapshot: Record<string, string>) {
      const { fsName, fsRootPath } =
         await TempFileService.instance.restoreFileSystem(fsSnapshot);

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
         const result = await createContainer();
         // 容器在创建过程中（container.start() 之后）就已登记，这里不再重复登记。
         return result;
      } catch (error) {
         console.error('Error starting live server container:', error);
         // 兜底：createContainer 内部任何一步失败（attach / start / waitForReady / 之后的异常）
         // 都必须把容器删掉。实测中漏掉这一步会在集中提交时迅速堆积出上百个容器。
         await this.removeLiveServersWithAliasPrefix(fsName);
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
   private async removeLiveServersWithAliasPrefix(fsName: string) {
      await ignoreError(async () => {
         const containers = await this.listContainersByImage(
            'challenge-live-server-agent',
         );
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
      try {
         const containers = await this.listContainersByImage(
            'challenge-live-server-agent',
         );

         const nowSec = Date.now() / 1000;
         let removed = 0;

         for (const info of containers) {
            if (this.activeLiveServerIds.has(info.Id)) continue;
            const ageMs = (nowSec - info.Created) * 1000;
            if (ageMs < minAgeMs) continue;

            console.log(
               `[INFO] Removing stale live-server container ${info.Id.slice(0, 12)} (age ${Math.round(ageMs / 1000)}s)`,
            );
            const ok = await ignoreError(() =>
               this.docker.getContainer(info.Id).remove({ force: true }),
            );
            if (ok !== null) removed++;
         }

         if (removed > 0) {
            console.log(
               `[INFO] Swept ${removed} stale live-server container(s), ${this.activeLiveServerIds.size} still active`,
            );
         }
      } catch (error) {
         console.error('[ERROR] Failed to sweep stale live-server containers:', error);
      }
   }

   async startPlaywrightContainer() {
      const imageName = 'challenge-judge-machine-agent';
      let container: Docker.Container;

      // 优先复用已占着 1889 端口 / 同名镜像的容器。
      // 必须按镜像名而非 tag 过滤：镜像重建后旧容器会变成 dangling，tag 匹配不到它，
      // 于是会误判为"无旧容器"并重复绑定 1889，导致启动失败。
      //
      // listContainersByImage 现在会连已退出的容器一起返回（清扫需要），
      // 但这里只能复用**正在运行**的，否则会把已退出的容器当成判题机去连 WebSocket。
      const candidates = (await this.listContainersByImage(imageName)).filter(
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

      const ws = await this.connectWebSocket();

      return {
         containerId: container.id,
         container,
         ws,
      };
   }

   async connectWebSocket() {
      // 判题机容器的 3000 端口被映射到宿主机的 1889，调度器通过 WebSocket 把任务发给它。
      //
      // 这个地址取决于调度器跑在哪里，写死任何一种都会在另一种形态下挂住：
      //   - 调度器跑在宿主机（pnpm dev）：localhost 即可，且该环境下
      //     host.docker.internal 往往无法解析（本项目实测如此），所以默认值仍取 localhost；
      //   - 调度器跑在容器里（docker compose，即 Dockerfile 的目标形态）：容器内的
      //     localhost 指向容器自身，连不上宿主机的 1889。此时必须由 compose 注入
      //     JUDGE_MACHINE_WS_URL=ws://host.docker.internal:1889/link。
      //
      // 两种情况下失败的症状都是"静默挂起"：init() 卡在 connectWebSocket，
      // 调度器既不监听 1888 也不报错，日志停在"正在初始化服务依赖..."。
      const wsUrl =
         process.env.JUDGE_MACHINE_WS_URL ?? 'ws://localhost:1889/link';
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
