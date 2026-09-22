const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, dependencies = {}) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => dependencies[name], mod, mod.exports)
  return mod.exports
}
const ledger = load('lib/item-card-ledger.ts')
const line = changes => ({ id: 1, voucher_id: 1, vch_type: 17, movement_date: '2026-09-01', qnty: 2, bonus: 1, unit_factor: 12, price: 120, store_id: 1, ...changes })
const build = (lines, warehouses = [], transfers = false) => ledger.buildItemCard(lines, '2026-09-01', '2026-09-30', warehouses, transfers)

test('opening and running balances use main units while quantities and prices retain voucher units', () => {
  const result = build([line({ id: 2, voucher_id: 2, vch_type: 12, qnty: 3, bonus: 0, unit_factor: 1 }), line({ movement_date: '2026-08-01' })])
  assert.equal(result.opening_balance, 36)
  assert.equal(result.closing_balance, 33)
  assert.equal(result.rows[0].quantity_out, 3)
  assert.equal(result.rows[0].balance, 33)
  assert.equal(result.issued_quantity, 3)
  assert.equal(result.rows[0].price, 120)
  assert.equal(result.rows[0].amount, 360)
})
test('bonus stays in stock totals whether shown separately or combined', () => {
  const result = build([line()])
  assert.equal(result.rows[0].quantity_in, 3)
  assert.equal(result.rows[0].paid_quantity_in, 2)
  assert.equal(result.rows[0].bonus, 1)
  assert.equal(result.rows[0].amount, 240)
  assert.equal(result.received_quantity, 36)
  assert.equal(result.closing_balance, 36)
})
test('ignores linked invoices and movements after cutoff, includes consignment returns', () => {
  const result = build([line({ vch_type: 18 }), line({ delivery_item_id: 5 }), line({ vch_type: 12, delivery_item_id: 6 }), line({ movement_date: '2026-10-01' }), line({ id: 3, vch_type: 14 }), line({ id: 4, vch_type: 15 })])
  assert.equal(result.rows.length, 3)
  assert.equal(result.closing_balance, 36)
})
test('transfers affect one warehouse, net to zero across warehouses, and can be shown internally', () => {
  const transfer = line({ vch_type: 10, from_store_id: 1, to_store_id: 2, from_store_name: 'source', to_store_name: 'destination' })
  assert.equal(build([transfer], [1]).closing_balance, -36)
  const destination = build([transfer], [2])
  assert.equal(destination.closing_balance, 36)
  assert.equal(destination.rows[0].store_name, 'destination')
  assert.equal(build([transfer], [3]).rows.length, 0)
  assert.equal(build([transfer], [1, 2]).rows.length, 0)
  assert.equal(build([transfer]).rows.length, 0)
  const all = build([transfer], [], true)
  assert.equal(all.rows.length, 2)
  assert.equal(all.closing_balance, 0)
  assert.equal(all.received_quantity, 36)
  assert.equal(all.issued_quantity, 36)
})
test('net price removes included VAT and applies line and header discounts without charging bonus', () => {
  const result = build([line({ price: 116, vat_ratio: 16, vat_included: true, discount: 10, header_discount_type: 'amount', header_discount_value: 18, header_subtotal: 180 })])
  assert.ok(Math.abs(result.rows[0].price - 81) < 1e-9)
  assert.ok(Math.abs(result.rows[0].amount - 162) < 1e-9)
  const percent = build([line({ price: 100, header_discount_type: 'percentage', header_discount_value: 20 })])
  assert.equal(percent.rows[0].price, 80)
})
test('zero movements in period retain opening balance and use header warehouse for unset row store', () => {
  const result = build([line({ movement_date: '2026-08-01', store_id: 0, to_store_id: 2 })], [2])
  assert.equal(result.rows.length, 0)
  assert.equal(result.opening_balance, 36)
  assert.equal(result.closing_balance, 36)
})

function routeHarness({ authenticated = true, product = true, tables = true } = {}) {
  const queries = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); queries.push({ query, values })
    assert.doesNotMatch(query, /inventory_transactions/)
    if (query.includes('to_regclass')) return [{ vouchers: tables ? 'voucher_items_tbl' : null }]
    if (query.includes('FROM voucher_items_tbl vi')) return [line()]
    if (query.includes('FROM products p')) return product ? [{ id: 1, main_unit: 'قطعة' }] : []
    return []
  }
  const route = load('app/api/reports/item-card/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/tenant-auth': { getSessionUser: async () => authenticated ? { organization_id: 1 } : null },
    '@/lib/item-inventory-reports': { getInventoryReportProducts: async () => [{ id: 1 }], reportDate: (value, fallback = '2026-09-30') => value || fallback },
    '@/lib/item-card-ledger': ledger, '@/lib/database': { __esModule: true, default: sql },
  })
  return { queries, get: (params = {}) => route.GET({ nextUrl: { searchParams: new URLSearchParams(params) } }) }
}
test('item-card endpoint reads posted active voucher lines, unit details and filters linked invoices', async () => {
  const { get, queries } = routeHarness()
  const response = await get({ product_id: '1', from_date: '2026-09-01', to_date: '2026-09-30' })
  assert.equal(response.status, 200)
  assert.equal(response.body.closing_balance, 36)
  assert.equal(response.body.product.main_unit, 'قطعة')
  const query = queries.find(query => query.query.includes('FROM voucher_items_tbl vi'))
  assert.match(query.query, /vh.vch_status=2 AND COALESCE\(vh.status,1\)<>3/)
  assert.match(query.query, /COALESCE\(vi.delivery_item_id,0\)=0/)
  assert.match(query.query, /vh.vch_date::date<=\?::date/)
  assert.ok(query.values.includes('2026-09-30'))
})
test('endpoint handles empty companies and rejects missing products, bad periods and unauthenticated requests', async () => {
  assert.equal((await routeHarness({ tables: false }).get({ product_id: '1' })).body.closing_balance, 0)
  assert.equal((await routeHarness({ product: false }).get({ product_id: '1' })).status, 404)
  assert.equal((await routeHarness({ authenticated: false }).get()).status, 401)
  assert.equal((await routeHarness().get({ product_id: 'abc' })).status, 400)
  assert.equal((await routeHarness().get({ from_date: '2026-10-01', to_date: '2026-09-01' })).status, 400)
  assert.equal((await routeHarness().get()).body.products.length, 1)
})
