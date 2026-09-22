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
const valuation = load('lib/voucher-inventory-valuation.ts')
const product = { id: 1, product_code: 'A1', last_purchase_price: 99, currency_id: 2 }
const receipt = overrides => ({ product_id: 1, vch_type: 17, qnty: 10, bonus: 0, unit_factor: 1, movement_date: '2026-09-01', cost_qnty: 10, cost_bonus: 0, cost_price: 20, cost_discount: 0, cost_unit_factor: 1, currency_conversion: 1, ...overrides })

test('valuation converts purchased units, includes bonuses, and allocates their cost', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt({ qnty: 2, bonus: 1, unit_factor: 12, cost_qnty: 2, cost_bonus: 1, cost_unit_factor: 12, cost_price: 120 })])
  assert.equal(row.balance, 36)
  assert.equal(row.received_value, 240)
  assert.equal(row.cost_quantity, 36)
  assert.equal(row.last_incoming_cost, 240 / 36)
})
test('sales, purchase returns, and sales returns change balance without adding selling prices to cost', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt(), receipt({ vch_type: 12, qnty: 4, cost_price: 100 }), receipt({ vch_type: 19, qnty: 2 }), receipt({ vch_type: 16, qnty: 1, cost_price: 100 })])
  assert.equal(row.balance, 5)
  assert.equal(row.received_quantity, 11)
  assert.equal(row.issued_quantity, 6)
  assert.equal(row.received_value / row.cost_quantity, 20)
})
test('delivery-linked invoices and internal transfers do not duplicate stock', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt({ vch_type: 18 }), receipt({ delivery_item_id: 55 }), receipt({ vch_type: 10 }), receipt({ vch_type: 13, qnty: 3 }), receipt({ vch_type: 12, delivery_item_id: 56, qnty: 3 })])
  assert.equal(row.balance, 7)
  assert.equal(row.cost_quantity, 10)
})
test('purchase delivery uses linked invoice price and discounts supplied by query', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt({ vch_type: 18, cost_price: 116, cost_vat_ratio: 16, cost_vat_included: true, cost_discount: 10, cost_discount_type: 'amount', cost_discount_value: 90, cost_subtotal: 900, currency_conversion: 2 })])
  assert.equal(row.last_incoming_cost, 162)
  assert.equal(row.received_value, 1620)
})
test('average and last cost differ after later purchases; explicit zero stays zero', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt(), receipt({ qnty: 5, cost_qnty: 5, cost_price: 50 })])
  assert.equal(row.received_value / row.cost_quantity, 30)
  assert.equal(row.last_incoming_cost, 50)
  const [zero] = valuation.summarizeVoucherInventory([product], [receipt({ cost_price: 0 })])
  assert.equal(zero.last_incoming_cost, 0)
  assert.equal(valuation.summarizeVoucherInventory([product], [])[0].last_incoming_cost, 99)
})

test('moving average weights remaining stock, and FIFO consumes the oldest purchase first', () => {
  const lines = [receipt(), receipt({ vch_type: 12, qnty: 8 }), receipt({ qnty: 10, cost_qnty: 10, cost_price: 40 }), receipt({ vch_type: 12, qnty: 3 })]
  const [row] = valuation.summarizeVoucherInventory([product], lines)
  assert.equal(row.balance, 9)
  assert.ok(Math.abs(row.average_cost - 440 / 12) < 1e-9)
  assert.equal(row.fifo_cost, 40)
  assert.equal(row.received_value / row.cost_quantity, 30) // Historical average was the bug.
})

test('FIFO values remaining layers and allocates bonus cost once', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt(), receipt({ cost_price: 40 }), receipt({ vch_type: 12, qnty: 5 })])
  assert.equal(row.average_cost, 30)
  assert.equal(row.fifo_cost, 500 / 15)
  const [bonus] = valuation.summarizeVoucherInventory([product], [receipt({ qnty: 2, bonus: 1, unit_factor: 12, cost_qnty: 2, cost_bonus: 1, cost_unit_factor: 12, cost_price: 120 })])
  assert.equal(bonus.fifo_cost, 240 / 36)
  assert.equal(bonus.average_cost, 240 / 36)
})

test('returns retain inventory cost, and purchase-return cost adjustment follows system option', () => {
  const lines = [receipt(), receipt({ cost_price: 40 }), receipt({ vch_type: 19, qnty: 5, cost_qnty: 5, cost_price: 40 })]
  const [without] = valuation.summarizeVoucherInventory([product], lines)
  const [withReturns] = valuation.summarizeVoucherInventory([product], lines, true)
  assert.equal(without.average_cost, 30)
  assert.equal(withReturns.average_cost, 400 / 15)
  const [returned] = valuation.summarizeVoucherInventory([product], [receipt(), receipt({ vch_type: 16, cost_price: 1000 })])
  assert.equal(returned.average_cost, 20)
  assert.equal(returned.fifo_cost, 20)
})

test('new purchases reset moving cost after zero or negative stock', () => {
  const [row] = valuation.summarizeVoucherInventory([product], [receipt(), receipt({ vch_type: 12, qnty: 15 }), receipt({ qnty: 10, cost_qnty: 10, cost_price: 50 })])
  assert.equal(row.balance, 5)
  assert.equal(row.average_cost, 50)
  assert.equal(row.fifo_cost, 50)
})

test('balance query uses only voucher items, posted active headers, cutoff and source links', async () => {
  const queries = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); queries.push({ query, values })
    assert.doesNotMatch(query, /inventory_transactions|product_stock/)
    if (query.includes('FROM voucher_items_tbl vi')) return [receipt()]
    return [product]
  }
  const reports = load('lib/item-inventory-reports.ts', { '@/lib/database': { __esModule: true, default: sql }, '@/lib/voucher-inventory-valuation': valuation, '@/lib/system-settings': { getSystemSettingValue: async () => false } })
  const [row] = await reports.getProductBalances(1, '2026-09-20', 1, 'A1')
  assert.equal(row.balance, 10)
  const query = queries.find(q => q.query.includes('FROM voucher_items_tbl vi'))
  assert.match(query.query, /vh.vch_status=2 AND COALESCE\(vh.status,1\)<>3/)
  assert.match(query.query, /invoice.vch_status=2 AND COALESCE\(invoice.status,1\)<>3/)
  assert.match(query.query, /invoice.vch_date::date<=\?::date/)
  assert.match(query.query, /vh.vch_date::date<=\?::date/)
  assert.match(query.query, /COALESCE\(vi.delivery_item_id,0\)=0/)
  assert.equal(query.values.filter(v => v === '2026-09-20').length, 2)
})

test('valuation endpoint applies average/last modes and zero-balance filter', async () => {
  const balances = valuation.summarizeVoucherInventory([product, { id: 2, last_purchase_price: 5 }], [receipt(), receipt({ qnty: 5, cost_qnty: 5, cost_price: 50 })])
  const route = load('app/api/reports/item-valuation/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/tenant-auth': { getSessionUser: async () => ({ organization_id: 1 }) },
    '@/lib/item-inventory-reports': { getInventoryReportProducts: async () => [product], getProductBalances: async () => balances, reportDate: value => value || '2026-09-20' },
  })
  for (const mode of ['average', 'last', 'fifo']) {
    const response = await route.GET({ nextUrl: { searchParams: new URLSearchParams({ price_way: mode }) } })
    assert.equal(response.status, 200)
    assert.equal(response.body.rows.length, 1)
    assert.equal(response.body.rows[0].valuation_amount, mode === 'last' ? 750 : 450)
  }
  const response = await route.GET({ nextUrl: { searchParams: new URLSearchParams({ with_zeros: '1' }) } })
  assert.equal(response.body.rows.length, 2)
})
