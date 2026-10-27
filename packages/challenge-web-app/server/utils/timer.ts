import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import prisma from '~~/lib/prisma';
import { logger } from './logger';

export type TimerTaskSnapshot = {
  taskId: string;
  handlerId: string;
  /** 本次执行是第几次尝试（从 1 开始） */
  attempts: number;
};

export type TimerHandler<P = unknown> = (
  payload: P,
  task: TimerTaskSnapshot
) => void | Promise<void>;

const handlers = new Map<string, TimerHandler<never>>();

/**
 * 注册定时任务处理器（重复注册同 ID 会覆盖旧处理器）。
 * 通常在各模块初始化时调用，随后即可用 dispatchTimerTask 发布任务。
 */
export function registerTimerHandler<P = unknown>(
  id: string,
  handler: TimerHandler<P>
): void {
  if (handlers.has(id)) {
    logger.warn(`[timer] 处理器 ${id} 重复注册，已覆盖旧处理器`);
  }
  handlers.set(id, handler as unknown as TimerHandler<never>);
}

export function hasTimerHandler(id: string): boolean {
  return handlers.has(id);
}

export type DispatchTimerOptions = {
  /** 预定执行时间（与 delayMs 二选一，都不传则立即到期） */
  runAt?: Date;
  /** 延迟毫秒数后执行 */
  delayMs?: number;
  /** 最大尝试次数，默认 3 */
  maxAttempts?: number;
};

/**
 * 发布一个定时任务：写入数据库，由 Worker 轮询到到期后执行 handlerId 对应的处理器。
 * @returns 任务 ID
 */
export async function dispatchTimerTask<P = unknown>(
  handlerId: string,
  payload?: P,
  options: DispatchTimerOptions = {}
): Promise<string> {
  if (!handlers.has(handlerId)) {
    throw new Error(`[timer] 未注册的定时任务处理器: ${handlerId}`);
  }
  const runAt =
    options.runAt ??
    (options.delayMs !== undefined
      ? dayjs().add(options.delayMs, 'millisecond').toDate()
      : dayjs().toDate());

  const task = await prisma.timerTask.create({
    data: {
      handlerId,
      payload:
        payload === undefined
          ? Prisma.JsonNull
          : (payload as Prisma.InputJsonValue),
      runAt,
      maxAttempts: options.maxAttempts,
    },
  });
  return task.id;
}

type ClaimedRow = {
  id: string;
  handlerId: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

/**
 * 领取到期任务：单条 UPDATE ... RETURNING 原子领取，
 * 多实例部署时 FOR UPDATE SKIP LOCKED 保证同一任务只被一个实例消费。
 * 注意：TimerTask 模型的列未做 @map 映射，数据库列名即驼峰（handlerId / runAt 等）。
 * 列类型是 TIMESTAMP（无时区），Prisma 写入的是 UTC 挂钟时间；
 * 与 now()（timestamptz）直接比较会被按会话时区（如 Asia/Shanghai）转换，
 * 导致任务提前最多 8 小时被执行，故必须用 now() AT TIME ZONE 'UTC' 对齐到 UTC 挂钟时间。
 */
async function claimDueTasks(batchSize: number): Promise<ClaimedRow[]> {
  return prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "timer_tasks" SET "status" = 'running', "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "timer_tasks"
      WHERE "status" = 'pending' AND "runAt" <= now() AT TIME ZONE 'utc'
      ORDER BY "runAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "handlerId", "payload", "attempts", "maxAttempts"
  `;
}

async function executeTask(row: ClaimedRow): Promise<void> {
  const handler = handlers.get(row.handlerId) as
    | TimerHandler<unknown>
    | undefined;
  if (!handler) {
    await failTask(row, new Error(`未注册的定时任务处理器: ${row.handlerId}`));
    return;
  }

  try {
    await handler(row.payload, {
      taskId: row.id,
      handlerId: row.handlerId,
      attempts: row.attempts + 1,
    });
    await prisma.timerTask.update({
      where: { id: row.id },
      data: { status: 'done', executedAt: dayjs().toDate(), error: null },
    });
  } catch (err) {
    await failTask(row, err);
  }
}

async function failTask(row: ClaimedRow, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const attempts = row.attempts + 1;

  if (attempts >= row.maxAttempts) {
    await prisma.timerTask.update({
      where: { id: row.id },
      data: { status: 'failed', attempts, error: message },
    });
    logger.error(
      `[timer] 任务 ${row.id}（${row.handlerId}）执行失败，已达最大尝试次数 ${row.maxAttempts}: ${message}`
    );
    return;
  }

  const backoff = Math.min(
    workerConfig.retryBackoffMs * attempts,
    workerConfig.maxRetryBackoffMs
  );
  await prisma.timerTask.update({
    where: { id: row.id },
    data: {
      status: 'pending',
      attempts,
      error: message,
      runAt: dayjs().add(backoff, 'millisecond').toDate(),
    },
  });
  logger.warn(
    `[timer] 任务 ${row.id}（${row.handlerId}）执行失败，${Math.round(backoff / 1000)}s 后第 ${attempts + 1} 次重试: ${message}`
  );
}

async function poll(batchSize: number): Promise<void> {
  try {
    const rows = await claimDueTasks(batchSize);
    for (const row of rows) {
      await executeTask(row);
    }
  } catch (err) {
    logger.error({ err }, '[timer] 轮询定时任务失败');
  }
}

export type TimerWorkerOptions = {
  /** 轮询间隔毫秒数 */
  pollIntervalMs: number;
  /** 单次轮询最多领取的任务数 */
  batchSize: number;
  /** 失败重试退避基数毫秒数 */
  retryBackoffMs: number;
  /** 重试退避上限毫秒数 */
  maxRetryBackoffMs: number;
};

let workerConfig: TimerWorkerOptions;
let interval: ReturnType<typeof setInterval> | null = null;
let polling = false;

/**
 * 启动定时任务 Worker：按 pollIntervalMs 间隔轮询数据库。
 * 幂等，可安全地在 Nitro 插件中调用；轮询本身有重入保护。
 */
export function startTimerWorker(options: TimerWorkerOptions): void {
  if (interval) return;

  workerConfig = options;
  const { pollIntervalMs, batchSize } = options;

  interval = setInterval(() => {
    if (polling) return;
    polling = true;
    void poll(batchSize).finally(() => {
      polling = false;
    });
  }, pollIntervalMs);
  // 不阻止进程退出
  interval.unref?.();

  logger.info(`[timer] 定时任务 Worker 已启动，每 ${pollIntervalMs / 1000}s 轮询一次，单批最多 ${batchSize} 个任务`);
  // 启动即先拉取一次，避免重启后积压任务等到下一个周期
  polling = true;
  void poll(batchSize).finally(() => {
    polling = false;
  });
}

export function stopTimerWorker(): void {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}
