const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
function load(file, sql, authorize) {
  const mod = { exports: {} }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/database': { __esModule: true, default: sql },
    '@/lib/transaction-permissions': { authorizeTransaction: authorize },
    '@/lib/order-schema': { ensureOrderReadColumns: async () => {} },
    '../_lib': { ensureTables: async () => {} },
  }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: options }).outputText
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || {}, mod, mod.exports)
  return mod.exports
}

for (const orderType of [1, 2]) test(`invoice order source uses shared tables for order type ${orderType}`, async () => {
  const calls = []
  const sql = async (parts, ...values) => { const query = parts.join('?'); calls.push({ query, values }); return query.includes('SELECT o.*') ? [{ id: 7 }] : [] }
  const authorize = async (_request, family) => { assert.equal(family, orderType === 2 ? 'purchase_invoice' : 'sales_invoice'); return { ok: true, branchIds: [9] } }
  const list = load('app/api/sales-vouchers/order-list/route.ts', sql, authorize)
  assert.equal((await list.GET({ url: `http://test/?order_type=${orderType}&${orderType === 2 ? 'supplier_id' : 'customer_id'}=4&branch_id=9` })).status, 200)
  assert.match(calls[0].query, /o\.order_type = \?/)
  assert.ok(calls[0].values.includes(orderType))
  assert.ok(calls[0].values.includes(orderType === 2 ? 17 : 12))
  assert.match(calls[0].query, /oi\.item_status IN \(2, 3, 4\)/)
  calls.length = 0
  const items = load('app/api/sales-vouchers/order-items/route.ts', sql, authorize)
  assert.equal((await items.GET({ url: `http://test/?order_id=7&order_type=${orderType}&branch_id=9` })).status, 200)
  assert.match(calls[0].query, /o\.order_type=\?/)
  assert.match(calls[1].query, /FROM order_items oi/)
  assert.match(calls[1].query, /vi\.delivery_item_id IS NULL/)
  assert.ok(calls[1].values.includes(orderType === 2 ? 17 : 12))
  assert.ok(calls.every(call => !/purchase_orders|purchase_order_items|supplier_id|workflow_status/.test(call.query)))
})

test('delivery source types follow invoice direction even when a mismatched type is requested', async () => {
  for (const [invoiceType, types] of [[12, [13,14]], [17, [18]]]) {
    let captured
    const route = load('app/api/sales-vouchers/delivery-list/route.ts', async (parts, ...values) => { captured = { query: parts.join('?'), values }; return [] }, async () => ({ ok: true, branchIds: [9] }))
    const response = await route.GET({ url: `http://test/?voucher_type=${invoiceType}&customer_id=4&delivery_types=13,18&branch_id=9` })
    assert.equal(response.status, 200)
    assert.ok(captured.values.some(value => Array.isArray(value) && JSON.stringify(value) === JSON.stringify(types)))
    assert.match(captured.query, /COALESCE\(inv.status,1\)<>3/)
  }
})

function sourceValidator(sql) {
  const file = 'app/api/sales-vouchers/route.ts', text = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  let code
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'validateSourceInvoice') code = node.initializer.getText(source); ts.forEachChild(node, visit) }
  visit(source)
  const js = ts.transpileModule(`const validate = ${code}`, { compilerOptions: options }).outputText
  return new Function('sql', 'SALES_INVOICE_VCH_TYPE', 'PURCHASE_INVOICE_VCH_TYPE', 'DELIVERY_PAY_VCH_TYPE', 'DELIVERY_SELL_VCH_TYPE', 'DELIVERY_CONSIGNMENT_SALE_VCH_TYPE', `${js};return validate`)(sql, 12, 17, 18, 13, 14)
}
test('purchase invoice validates shared order items and preserves several source orders', async () => {
  const validate = sourceValidator(async (parts, ...values) => {
    const query = parts.join('?')
    assert.ok(!query.includes('purchase_order_items'))
    if (query.includes('FROM order_items oi')) {
      assert.ok(values.includes(2)); assert.match(query, /o.customer_id=\?/)
      return [{ id: 20, order_id: 7, quantity: 5, bonus: 1 }, { id: 21, order_id: 8, quantity: 3, bonus: 0 }]
    }
    return []
  })
  const data = { vch_type: 17, invoice_source_type: 3, source_voucher_id: 7, source_voucher_type: 3, account_id: 4, branch_id: 9 }
  const items = [{ order_item_id: 20, source_voucher_id: 7, quantity: 5, bonus_quantity: 1 }, { order_item_id: 21, source_voucher_id: 8, quantity: 3 }]
  assert.equal(await validate(items, data), null)
  assert.ok(await validate([{ ...items[0], quantity: 6 }], data))
})

test('invoice source endpoints honor authorization failures', async () => {
  const route = load('app/api/sales-vouchers/order-list/route.ts', async () => assert.fail('must not query sources'), async () => ({ ok: false, response: { status: 403 } }))
  assert.equal((await route.GET({ url: 'http://test/?order_type=2&supplier_id=4' })).status, 403)
})
