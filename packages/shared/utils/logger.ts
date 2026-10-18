import { hostname } from 'node:os';
import pino from 'pino';
import type { Logger } from 'pino';

export type { Logger };

/** LOG_REPORTING_PROTOCOL（docs/LOG_REPORTING_PROTOCOL.md）的统一实现：生产输出 OTel 风格 JSON Lines，开发用 pino-pretty；trace 链路用 logger.child({ trace_id }) 绑定到协议顶层字段。 */

/** pino level number -> OTel severity_number（协议 §5）。 */
const PINO_TO_OTEL_SEVERITY: Record<number, number> = {
   10: 1, // trace
   20: 5, // debug
   30: 9, // info
   40: 13, // warn
   50: 17, // error
   60: 21, // fatal
};

/** 允许写到协议顶层（OTel Log Record 标准字段）的自定义键；其余键一律归入 attributes。 */
const TOP_LEVEL_KEYS = new Set(['trace_id', 'span_id', 'trace_flags']);

export interface BuildLoggerOptions {
   /** resource.service.name，必填，如 'challenge-cloud-function'。 */
   serviceName: string;
   /** resource.service.version（git sha 或镜像 tag）。 */
   serviceVersion?: string;
   /** 默认日志级别，可被 LOG_LEVEL 环境变量覆盖。 */
   level?: string;
}

/** err 键归一化为 OTel 错误语义字段（协议 §6.1）。 */
const errorAttributes = (error: unknown): Record<string, unknown> => {
   if (error instanceof Error) {
      return {
         'error.type': error.name,
         'exception.message': error.message,
         'exception.stacktrace': error.stack,
      };
   }
   return { 'error.type': typeof error, 'exception.message': String(error) };
};

/** 调用方对象 -> attributes：trace_* 保持协议顶层，其余键全部收进 attributes。 */
const toProtocolObject = (
   obj: Record<string, unknown>,
): Record<string, unknown> => {
   const { err, ...rest } = obj;
   const topLevel: Record<string, unknown> = {};
   const attributes: Record<string, unknown> = {};
   for (const [key, value] of Object.entries(rest)) {
      if (TOP_LEVEL_KEYS.has(key)) {
         topLevel[key] = value;
      } else if (
         key === 'attributes' &&
         value &&
         typeof value === 'object' &&
         !Array.isArray(value)
      ) {
         Object.assign(attributes, value);
      } else {
         attributes[key] = value;
      }
   }
   if (err !== undefined) Object.assign(attributes, errorAttributes(err));
   return Object.keys(attributes).length > 0 ? { ...topLevel, attributes } : topLevel;
};

export const buildLogger = (options: BuildLoggerOptions): Logger => {
   const level = process.env.LOG_LEVEL || options.level || 'info';

   // 开发环境：pino-pretty 美化输出，不做字段映射（协议 §1）。
   if (process.env.NODE_ENV !== 'production') {
      return pino({
         level,
         transport: {
            target: 'pino-pretty',
            options: {
               colorize: true,
               translateTime: 'SYS:standard',
               ignore: 'pid,hostname',
            },
         },
      });
   }

   // 生产环境：OTel 风格 JSON Lines。
   const resource: Record<string, unknown> = {
      'service.name': options.serviceName,
      'deployment.environment.name':
         process.env.DEPLOYMENT_ENVIRONMENT || 'production',
      'host.name': hostname(),
      'process.pid': process.pid,
   };
   if (options.serviceVersion) {
      resource['service.version'] = options.serviceVersion;
   }

   return pino({
      level,
      // msg -> body
      messageKey: 'body',
      // time -> timestamp（ISO 8601 UTC 字符串）
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      // resource 作为根绑定注入，子 logger 自动继承
      base: { resource },
      formatters: {
         // level -> severity_number / severity_text
         level: (label, number) => ({
            severity_number: PINO_TO_OTEL_SEVERITY[number] ?? number,
            severity_text: label.toUpperCase(),
         }),
         // 其余键收入 attributes
         log: toProtocolObject,
      },
   });
};
