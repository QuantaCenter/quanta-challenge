import { Hono } from 'hono'
import { getAlert, insertAlertEvent, listAlertEvents, listAlerts, upsertAlert } from '../db.ts'

// Grafana 告警 webhook 接收端，记录持久化到 SQLite
interface GrafanaAlert {
   status: string
   labels?: Record<string, string>
   annotations?: Record<string, string>
   startsAt?: string
   endsAt?: string
   fingerprint?: string
}

interface GrafanaWebhookPayload {
   status?: string
   alerts?: GrafanaAlert[]
}

export const alertRoutes = new Hono()

alertRoutes.post('/webhook', async (c) => {
   let payload: GrafanaWebhookPayload
   try {
      payload = await c.req.json()
   }
   catch {
      return c.text('invalid json', 400)
   }

   const alerts = payload.alerts ?? []
   for (const alert of alerts) {
      const fingerprint = alert.fingerprint ?? `${alert.labels?.alertname ?? 'unknown'}-${alert.labels?.grafana_folder ?? ''}`
      const status = (alert.status === 'resolved' ? 'resolved' : 'firing') as 'firing' | 'resolved'
      const alertname = alert.labels?.alertname ?? alert.labels?.__name__ ?? 'unknown'
      const severity = alert.labels?.severity ?? 'info'

      const id = upsertAlert({
         fingerprint,
         alertname,
         status,
         severity,
         labels: alert.labels ?? {},
         annotations: alert.annotations ?? {},
         startsAt: alert.startsAt ?? null,
         endsAt: status === 'resolved' ? (alert.endsAt ?? new Date().toISOString()) : null,
      })
      insertAlertEvent(id, status, payload.status ?? status)
   }

   return c.json({ received: alerts.length })
})

// 告警记录查询 API
alertRoutes.get('/', (c) => {
   const limit = Number(c.req.query('limit') ?? '100')
   const status = c.req.query('status')

   let records = listAlerts(Number.isFinite(limit) ? limit : 100)
   if (status === 'firing' || status === 'resolved')
      records = records.filter(r => r.status === status)

   return c.json({ alerts: records, count: records.length })
})

alertRoutes.get('/:id', (c) => {
   const id = Number(c.req.param('id'))
   const record = Number.isFinite(id) ? getAlert(id) : undefined
   if (!record)
      return c.text('not found', 404)
   return c.json({ alert: record, events: listAlertEvents(id) })
})
