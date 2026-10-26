import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { register } from '../src/server/metrics.ts'

interface Panel {
   id: number
   title: string
   gridPos: { x: number; y: number; w: number; h: number }
   targets: Array<{ expr: string; instant?: boolean; format?: string }>
}
const dashboard: { uid: string; panels: Panel[] } = JSON.parse(readFileSync(new URL('../deploy/grafana/dashboards/frontend.json', import.meta.url), 'utf8'))

test('frontend dashboard has unique non-overlapping panels', () => {
   assert.equal(dashboard.uid, 'obs-frontend')
   assert.equal(new Set(dashboard.panels.map(panel => panel.id)).size, dashboard.panels.length)
   for (let i = 0; i < dashboard.panels.length; i++) {
      const a = dashboard.panels[i].gridPos
      assert.ok(a.x >= 0 && a.x + a.w <= 24)
      for (let j = i + 1; j < dashboard.panels.length; j++) {
         const b = dashboard.panels[j].gridPos
         assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
      }
   }
})

test('device, flow and page panels reference registered navigation metrics and selected time range', () => {
   assert.ok(register.getSingleMetric('frontend_page_views_total'))
   assert.ok(register.getSingleMetric('frontend_navigation_total'))
   const devices = dashboard.panels.find(panel => panel.title === '设备分布（页面访问量）')
   assert.ok(devices?.targets[0].expr.includes('sum by (device)'))
   assert.ok(devices?.targets[0].expr.includes('frontend_page_views_total[$__range]'))
   assert.equal(devices?.targets[0].instant, true)
   const flows = dashboard.panels.find(panel => panel.title === '页面来源去向 Top20')
   assert.ok(flows?.targets[0].expr.includes('sum by (from, to, device)'))
   assert.ok(flows?.targets[0].expr.includes('frontend_navigation_total[$__range]'))
   assert.equal(flows?.targets[0].format, 'table')
   assert.equal(flows?.targets[0].instant, true)
   const pages = dashboard.panels.find(panel => panel.title === '页面访问 Top20')
   assert.ok(pages?.targets[0].expr.includes('sum by (page)'))
   const entries = dashboard.panels.find(panel => panel.title === '首屏访问速率（按设备）')
   assert.ok(entries?.targets[0].expr.includes('kind="entry"'))
})
