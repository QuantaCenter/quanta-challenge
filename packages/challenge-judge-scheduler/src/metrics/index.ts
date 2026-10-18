import client from 'prom-client';
import { DockerService } from '../services/docker';
import { QueueService } from '../services/queue';

/** 判题业务指标：与 observation 的 http_* 指标共用 prom-client 全局 registry 由 /metrics 统一输出；dev 下 HMR 会二次执行本模块，故统一幂等注册。 */

const QUEUE_STATES = [
   'waiting',
   'active',
   'completed',
   'failed',
   'delayed',
   'paused',
] as const;

function getOrRegister<M extends client.Metric>(name: string, create: () => M): M {
   return (client.register.getSingleMetric(name) as M) ?? create();
}

export const judgeQueueDepth = getOrRegister(
   'judge_queue_depth',
   () =>
      new client.Gauge({
         name: 'judge_queue_depth',
         help: 'BullMQ 判题队列各状态任务数（waiting/active/completed/failed/delayed/paused）',
         labelNames: ['queue', 'state'] as const,
         registers: [client.register],
         async collect() {
            try {
               // 保证 judge-task 序列从启动起就存在，避免「无数据」与「无积压」无法区分
               const queueNames = new Set([
                  'judge-task',
                  ...QueueService.instance.queues.keys(),
               ]);
               for (const queueName of queueNames) {
                  const queue = QueueService.instance.getQueue(queueName);
                  const counts = await queue.getJobCounts(...QUEUE_STATES);
                  for (const state of QUEUE_STATES) {
                     this.set({ queue: queueName, state }, counts[state] ?? 0);
                  }
               }
            } catch {
               // Redis 不可用时让本次抓取保留上一次的值，而不是整个 /metrics 500
            }
         },
      })
);

export const judgeMachineAvailable = getOrRegister(
   'judge_machine_available',
   () =>
      new client.Gauge({
         name: 'judge_machine_available',
         help: '判题机可用性（1=可用 0=不可用）。kind=frontend 与 /health 的 degraded 状态同源',
         labelNames: ['kind'] as const,
         registers: [client.register],
         collect() {
            const docker = DockerService.instance;
            this.set({ kind: 'frontend' }, docker.judgeMachine.available ? 1 : 0);
            // 后端判题机是懒加载的：从未跑过后端题时 0 属正常
            this.set(
               { kind: 'backend' },
               docker.backendJudgeMachineWs?.readyState === WebSocket.OPEN ? 1 : 0
            );
         },
      })
);

export const judgeResultsTotal = getOrRegister(
   'judge_results_total',
   () =>
      new client.Counter({
         name: 'judge_results_total',
         help: '判题结果计数（outcome: pass=通过 / fail=未通过 / error=执行异常）',
         labelNames: ['mode', 'outcome'] as const,
         registers: [client.register],
      })
);

export const judgeTaskDurationSeconds = getOrRegister(
   'judge_task_duration_seconds',
   () =>
      new client.Histogram({
         name: 'judge_task_duration_seconds',
         help: '单个判题任务从开始处理到结束的耗时（含容器启动与结果入库）',
         labelNames: ['mode', 'outcome'] as const,
         buckets: [0.5, 1, 2.5, 5, 10, 20, 30, 60, 120],
         registers: [client.register],
      })
);

export const judgeTaskPendingSeconds = getOrRegister(
   'judge_task_pending_seconds',
   () =>
      new client.Histogram({
         name: 'judge_task_pending_seconds',
         help: '判题任务在队列中的等待时长（入队到开始处理）',
         labelNames: ['mode'] as const,
         buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
         registers: [client.register],
      })
);
