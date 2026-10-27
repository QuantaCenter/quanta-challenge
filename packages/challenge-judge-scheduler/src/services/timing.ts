import { Singleton } from '../utils/singleton';
import { logger } from '../utils/logger';

export type TimingType = 'start' | 'end';

export interface ITimingParams {
   /** 计时标识，一般传 judgeRecordId / jobId，用于串联同一条链路。 */
   id: string;
   /** start 记录起点，end 结算耗时并自动打日志。 */
   type: TimingType;
   /** 节点描述，如「容器启动」「判题执行」；同一节点 start / end 需传相同值。 */
   description: string;
}

export interface ITimingRecord {
   id: string;
   description: string;
   startedAt: number;
   endedAt: number;
   duration: number;
}

interface IPendingNode {
   description: string;
   startedAt: number;
}

export class TimingService extends Singleton {
   static get instance() {
      return this.getInstance<TimingService>();
   }

   /** 进行中的计时：ID -> 该链路上尚未结算的节点。 */
   private readonly pending = new Map<string, IPendingNode[]>();

   /** 统一入口：start 记录起点，end 结算耗时并自动打日志。 */
   record({ id, type, description }: ITimingParams): ITimingRecord | undefined {
      if (type === 'start') {
         this.begin(id, description);
         return undefined;
      }
      return this.finish(id, description);
   }

   /** 语法糖：记录节点起点。 */
   start(id: string, description: string) {
      this.record({ id, type: 'start', description });
   }

   /** 语法糖：结算节点并打日志。 */
   end(id: string, description: string) {
      return this.record({ id, type: 'end', description });
   }

   /** 包裹异步操作：成功或失败都会自动结算耗时。 */
   async measure<T>(
      id: string,
      description: string,
      fn: () => Promise<T> | T
   ): Promise<T> {
      this.start(id, description);
      try {
         return await fn();
      } finally {
         this.end(id, description);
      }
   }

   /** 丢弃 ID 下所有未结算的节点，任务异常退出时兜底。 */
   clear(id: string) {
      this.pending.delete(id);
   }

   private begin(id: string, description: string) {
      const nodes = this.pending.get(id) ?? [];
      nodes.push({ description, startedAt: Date.now() });
      this.pending.set(id, nodes);
   }

   private finish(id: string, description: string): ITimingRecord | undefined {
      const nodes = this.pending.get(id);
      if (!nodes?.length) {
         logger.warn(
            `缺少 start 记录，无法计时：id=${id} node=${description}`
         );
         return undefined;
      }

      // 优先结算同名节点；描述对不上时退化为最后一个，避免漏日志。
      let index = nodes.findIndex((node) => node.description === description);
      if (index < 0) index = nodes.length - 1;

      const [node] = nodes.splice(index, 1);
      if (!nodes.length) this.pending.delete(id);

      const endedAt = Date.now();
      const record: ITimingRecord = {
         id,
         description: node.description,
         startedAt: node.startedAt,
         endedAt,
         duration: endedAt - node.startedAt,
      };

      // 目前仅打日志；后续需要上报时在 report 里接入即可。
      logger.info(
         { duration: record.duration },
         `${record.description} (id=${id}) 耗时 ${record.duration}ms ` +
            `[${new Date(record.startedAt).toISOString()} -> ${new Date(endedAt).toISOString()}]`
      );
      this.report(record);

      return record;
   }

   /** 上报出口：当前为空实现，后续接入监控 / 埋点时覆写此方法。 */
   protected report(_record: ITimingRecord) {}
}
