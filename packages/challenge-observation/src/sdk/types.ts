/** 异常类型：js 脚本错误 / promise 未捕获拒绝 / 资源加载失败 */
export type ObsErrorType = 'js' | 'promise' | 'resource'

export interface ObsErrorEvent {
   kind: 'error'
   type: ObsErrorType
   message: string
   stack?: string
   source?: string
   lineno?: number
   colno?: number
   path?: string
}

export interface ObsApiEvent {
   kind: 'api'
   method: string
   url: string
   status?: number
   /** 毫秒 */
   duration?: number
   ok: boolean
}

/** 页面性能指标，时间类单位为秒，CLS 为无量纲分数 */
export interface ObsPerfMetrics {
   lcp?: number
   fcp?: number
   ttfb?: number
   inp?: number
   cls?: number
}

export interface ObsPerfEvent {
   kind: 'perf'
   path?: string
   metrics: ObsPerfMetrics
}

export type ObsEvent = ObsErrorEvent | ObsApiEvent | ObsPerfEvent

export interface ObservationOptions {
   /** 上报地址，例如 https://obs.example.com/api/v1/report */
   endpoint: string
   /** 应用标识，作为 metrics/logs 的 app 标签 */
   app: string
   /** 发布版本（git sha / 版本号），便于区分问题引入版本 */
   release?: string
   /** 上报接口 Token（与服务端 OBS_REPORT_TOKEN 一致） */
   token?: string
   /** 采样率 0-1，默认 1（全量） */
   sampleRate?: number
   /** 批量上报间隔（毫秒），默认 10000 */
   flushInterval?: number
   /** 单批最大事件数，默认 20 */
   maxBatch?: number
   /** 控制台输出调试日志 */
   debug?: boolean
   /** 需要追踪的 API 请求（默认同源请求全部追踪；可传正则数组扩大范围） */
   trackApi?: Array<string | RegExp>
   /** 忽略的错误信息（正则或字符串包含匹配） */
   ignoreErrors?: Array<string | RegExp>
}
