import React from 'react'; import { createRoot } from 'react-dom/client'
import { SalesProfitReport } from '@/components/reports/sales-profit-report'
const json = (data: any, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
const rows = [
  { key: 'p1', label: 'سكر أبيض 1 كغم', code: 'D000001', group_name: 'مواد غذائية', quantity: 120, bonus: 6, sale_rate: 4.5, cost_rate: 3.2, sale_total: 540, cost_total: 384, bonus_cost: 19.2, profit: 136.8, profit_margin: 25.3, markup: 33.9, sale_share: 47.8, profit_share: 52.1, unpriced_lines: 0, lines: 14 },
  { key: 'p2', label: 'زيت ذرة 1.8 لتر', code: 'D000002', group_name: 'زيوت', quantity: 40, bonus: 0, sale_rate: 12, cost_rate: 9.5, sale_total: 480, cost_total: 380, bonus_cost: 0, profit: 100, profit_margin: 20.8, markup: 26.3, sale_share: 42.5, profit_share: 38.1, unpriced_lines: 0, lines: 6 },
  { key: 'p3', label: 'تمر مجهول', code: 'D000003', group_name: 'بدون مجموعة', quantity: -1, bonus: 0, sale_rate: 16, cost_rate: 0, sale_total: 110, cost_total: 0, bonus_cost: 0, profit: 25.7, profit_margin: 23.4, markup: 0, sale_share: 9.7, profit_share: 9.8, unpriced_lines: 2, lines: 3 },
]
window.fetch = ((url: string, init?: any) => {
  const u = String(url)
  if (u.includes('meta=1')) return json({ products: [{ id: 1, code: 'D1', name: 'سكر' }], groups: [], warehouses: [{ id: 1, code: '1', name: 'الرئيسي' }], branches: [], customers: [], salesmen: [] })
  if (init?.method === 'POST') return json({ updated: 21, unpriced: 2 })
  return json({ rows, totals: { sale_total: 1130, cost_total: 764, bonus_cost: 19.2, profit: 262.5, lines: 23, unpriced_lines: 2, profit_margin: 23.2 }, group_by: 'item' })
}) as any
createRoot(document.getElementById('root')!).render(<div style={{ height: '100vh', display: 'flex' }}><SalesProfitReport mode="items" /></div>)
