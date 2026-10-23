import { startTimerWorker } from '../utils/timer';

/** 启动定时任务 Worker：定期轮询 timer_tasks 表，到期后执行已注册的处理器 */
export default defineNitroPlugin(() => {
   const { timer } = useRuntimeConfig();
   startTimerWorker(timer);
});
