/** 运行时配置（环境变量） */
export const config = {
   port: Number(process.env.OBS_PORT ?? 9310),
   dbPath: process.env.OBS_DB_PATH ?? './data/observation.sqlite3',
   /** 管理接口（配置/告警记录）Token；为空则拒绝所有管理请求 */
   apiToken: process.env.OBS_API_TOKEN ?? '',
   /** 前端上报接口 Token；为空表示上报接口不上锁 */
   reportToken: process.env.OBS_REPORT_TOKEN ?? '',
   /** Loki push 地址（前端错误日志转发） */
   lokiUrl: process.env.LOKI_URL ?? 'http://loki:3100',
}
