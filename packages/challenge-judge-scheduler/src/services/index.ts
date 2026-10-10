import { DockerService } from './docker';
import { PnpmCacheService } from './pnpm-cache';
import { QueueService } from './queue';
import { RedisService } from './redis';

export const initServices = async () => {
   // 共享 pnpm 缓存：确保挂载点存在并打印现状，路径没挂上时能第一时间发现。
   await PnpmCacheService.instance.init();
   await DockerService.instance.init();
   // 兜底清理上次异常退出遗留的判题容器
   await DockerService.instance.sweepStaleLiveServers();
   // 周期性清扫：进程内清理失败（job 失败 / 进程被强杀）时自愈，
   // 实测一次集中提交可泄漏上百个容器，仅靠启动时扫一遍不够。
   DockerService.instance.startLiveServerSweeper();
};

export const destroyServices = async () => {
   DockerService.instance.stopLiveServerSweeper();
   QueueService.instance.destroy();
   RedisService.instance.destroy();
   DockerService.instance.destroy();
};
