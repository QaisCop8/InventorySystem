import React from 'react'; import { createRoot } from 'react-dom/client'
import InternalStagePage from '@/components/manufacturing/internal-stage-page'
import InternalDashboardPage from '@/components/manufacturing/internal-dashboard-page'
import { InternalManufacturingSettingsPage } from '@/components/manufacturing/internal-manufacturing-pages'
const now = Date.now(), iso = (h: number) => new Date(now - h * 3600000).toISOString()
const item = (id: number, name: string, q: number, p = 0) => ({ id, voucher_id: 1, item_id: id, item_name: name, unit_name: 'كرتونة', qnty: q, prepared_quantity: p, received_quantity: 0, barcode: '62810' + id })
const requests = [
  { id: 11, vch_code: 'IM26000011', vch_date: iso(80).slice(0, 10), internal_status: 3, branch_id: 1, manufacturing_branch_id: 2, to_store_id: 1, destination_warehouse_id: 2, requester_name: 'أحمد علي', stage_since: iso(70), items: [item(1, 'لفاف تواليت ريما 32 رول', 5), item(2, 'سكر أبيض 1 كغم', 12), item(3, 'زيت ذرة 1.8 لتر', 6), item(4, 'أرز بسمتي 5 كغم', 3), item(5, 'شاي أحمد 100 كيس', 10), item(6, 'حليب بودرة', 4)] },
  { id: 12, vch_code: 'IM26000012', vch_date: iso(5).slice(0, 10), internal_status: 3, branch_id: 3, manufacturing_branch_id: 2, to_store_id: 3, destination_warehouse_id: 2, requester_name: 'سارة محمود', stage_since: iso(3), items: [item(7, 'معكرونة', 20)] },
]
const json = (data: any, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
;(window as any).__perm = !location.search.includes('noperm')
window.fetch = ((url: string) => {
  const u = String(url)
  if (u.startsWith('/api/branches')) return json([{ id: 1, branch_name: 'الفرع الرئيسي' }, { id: 2, branch_name: 'فرع رام الله' }, { id: 3, branch_name: 'فرع نابلس' }])
  if (u.startsWith('/api/warehouses')) return json([{ id: 1, warehouse_name: 'مستودع الرئيسي' }, { id: 2, warehouse_name: 'مستودع رام الله' }, { id: 3, warehouse_name: 'مستودع نابلس' }])
  if (u.includes('/permissions')) { const p = (window as any).__perm; return json({ branchId: 2, permissions: { dashboard: true, create: true, edit: true, delete: true, requestAudit: true, prepare: p, readyAudit: true, send: false, receive: true, receivedAudit: true, archive: true, settings: false }, settings: { requestAudit: true, preparation: true, readyAudit: true, send: true, receive: true, receivedAudit: false }, counts: { 2: 1, 3: 2, 4: 0, 5: 3, 6: 1 } }) }
  if (u.includes('/dashboard')) return json({ stages: { 2: { outgoing: 1, incoming: 0 }, 3: { outgoing: 0, incoming: 2 }, 5: { outgoing: 1, incoming: 3 }, 6: { outgoing: 1, incoming: 0 }, 8: { outgoing: 4, incoming: 6 } }, completedThisMonth: 7, averageHours: 26.5, fillRate: 93.4, overdueDays: 2, overdue: [{ id: 11, vch_code: 'IM26000011', internal_status: 3, branch_id: 1, manufacturing_branch_id: 2, direction: 'incoming', stage_since: iso(70) }], trend: Array.from({ length: 14 }, (_, i) => ({ day: new Date(now - (13 - i) * 86400000).toISOString().slice(0, 10), created: (i * 7) % 4, completed: (i * 5) % 3 })), topItems: [{ item_id: 1, item_name: 'سكر أبيض 1 كغم', unit_name: 'كيس', quantity: 120 }, { item_id: 2, item_name: 'زيت ذرة', unit_name: 'عبوة', quantity: 64 }, { item_id: 3, item_name: 'شاي', unit_name: 'علبة', quantity: 30 }], recent: [{ id: 1, action: 'prepare', to_status: 4, created_at: iso(1), vch_code: 'IM26000009', user_name: 'مدير النظام' }, { id: 2, action: 'receivedAudit', to_status: 8, created_at: iso(20), vch_code: 'IM26000004', user_name: 'سارة' }], partners: [{ branch_id: 1, outgoing: 3, incoming: 5 }, { branch_id: 3, outgoing: 1, incoming: 2 }] })
  if (u.startsWith('/api/internal-manufacturing-requests?status=')) return (window as any).__perm ? json(requests) : json({ error: 'no' }, 403)
  return json({})
}) as any
const page = new URLSearchParams(location.search).get('page')
createRoot(document.getElementById('root')!).render(page === 'dashboard' ? <InternalDashboardPage /> : page === 'settings' ? <InternalManufacturingSettingsPage /> : <InternalStagePage stageKey="preparation" />)
