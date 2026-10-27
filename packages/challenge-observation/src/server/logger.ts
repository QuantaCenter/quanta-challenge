import { hostname } from 'node:os'

/** 服务端日志：遵循 docs/LOG_REPORTING_PROTOCOL.md 的 OTel 风格 JSON Lines；observation 零 workspace 依赖，故内联实现。 */
const SEVERITY = {
   error: { number: 17, text: 'ERROR' },
   warn: { number: 13, text: 'WARN' },
   info: { number: 9, text: 'INFO' },
} as const

type Level = keyof typeof SEVERITY

const RESOURCE = {
   'service.name': 'challenge-observation',
   'deployment.environment.name':
      process.env.DEPLOYMENT_ENVIRONMENT
      || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
   'host.name': hostname(),
   'process.pid': process.pid,
}

const write = (level: Level, body: string, attributes?: Record<string, unknown>): void => {
   const severity = SEVERITY[level]
   const line = {
      timestamp: new Date().toISOString(),
      severity_number: severity.number,
      severity_text: severity.text,
      body,
      ...(attributes && Object.keys(attributes).length > 0 ? { attributes } : {}),
      resource: RESOURCE,
   }
   const stream = level === 'info' ? process.stdout : process.stderr
   stream.write(`${JSON.stringify(line)}\n`)
}

export const logger = {
   info: (body: string, attributes?: Record<string, unknown>) => write('info', body, attributes),
   warn: (body: string, attributes?: Record<string, unknown>) => write('warn', body, attributes),
   error: (body: string, attributes?: Record<string, unknown>) => write('error', body, attributes),
}
