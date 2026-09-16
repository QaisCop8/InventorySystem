// Run with: node --test scripts/test-pos-receipts.cjs
// Uses the actual POS handlers with an in-memory transaction and receipt API.
// No company database is contacted or modified.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(name => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name} in ${file}`)
    return mocks[name]
  }, module, module.exports)
  return module.exports
}

const next = { NextRequest: Request, NextResponse: { json: (body, options) => Response.json(body, options) } }
const receiptLogic = load('lib/pos-receipt.ts')
const receiptLib = load('app/api/receipts/_lib.ts', {
  '@/lib/database': {}, '../credit-cards/_lib': {}, '@/lib/system-settings': {}, '@/lib/voucher-code': load('lib/voucher-code.ts'),
})
const point = { id: 1, branch_id: 1, currency_id: 1, cash_account_id: 10, cheque_account_id: 11, card_account_id: 12, gift_account_id: 13, walk_in_account_id: 99, sales_book_id: 2, main_warehouse_id: 1 }
const invoice = { id: 100, vch_code: 'INV100', vch_type: 12, vch_date: '2026-09-15', account_id: 50, customer_name: 'Selected customer', currency_id: 1, rate: 1, status: 2, amount: 100 }
const request = data => new Request('http://localhost/api/pos/sales', { method: 'POST', body: JSON.stringify(data), headers: { 'content-type': 'application/json' } })

function harness(options = {}) {
  const state = { invoice: null, receipt: null, journal: [], queries: [], allocations: [], payload: null, commits: 0, rollbacks: 0, invoiceCreates: 0 }
  const sql = async (parts, ...values) => {
    const query = parts.join('?').replace(/\s+/g, ' ').trim()
    state.queries.push({ query, values })
    if (query.includes('WHERE pos_client_sale_id')) return state.invoice ? [state.invoice] : []
    if (query.startsWith('SELECT * FROM pos_sale_payments_tbl')) return state.allocations
    if (query.startsWith('DELETE FROM pos_sale_payments_tbl')) state.allocations = []
    if (query.startsWith('SELECT id,name FROM account_tbl')) return values[0] === 50 ? [{ id: 50, name: 'Selected customer' }] : []
    if (query.startsWith('SELECT id FROM account_tbl')) return options.invalidWalkIn && values[0] === point.walk_in_account_id ? [] : [{ id: 50 }]
    if (query.startsWith('SELECT id FROM banks') || query.startsWith('SELECT id FROM branches') || query.startsWith('SELECT id FROM credit_cards_types_tbl')) return [{ id: 1 }]
    if (query.includes('FROM voucher_book_user_permissions_tbl')) return options.noBook ? [] : [{ id: 3, name: 'A' }]
    if (query.startsWith('UPDATE voucher_journal_detail_tbl SET account_id')) {
      state.journal.find(row => row.order_no === values[3]).account_id = values[0]
    }
    if (query.startsWith('UPDATE voucher_header_tbl SET pos_receipt_voucher_id')) state.invoice.pos_receipt_voucher_id = values[0]
    if (query.startsWith('SELECT receipt.*')) return state.receipt ? [state.receipt] : []
    if (options.cashFailure && query.startsWith('UPDATE pos_sessions_tbl')) throw new Error('Cash balance update failed')
    if (query.startsWith('SELECT id,cheq_num,last_voucher_id')) return options.processedCheque ? [{ id: 1, last_voucher_id: 200, status_id: 4 }] : []
    if (query.startsWith('SELECT * FROM voucher_header_tbl WHERE id')) return state.invoice ? [state.invoice] : []
    if (query.startsWith('UPDATE voucher_header_tbl SET status=3')) { state.invoice.status = 3; return [] }
    if (query.startsWith('UPDATE voucher_header_tbl SET vch_code')) {
      state.invoice.status = 3
      return [state.invoice]
    }
    return []
  }
  const transaction = async fn => {
    const snapshot = structuredClone(state)
    try { const result = await fn(); state.commits++; return result }
    catch (error) { Object.assign(state, snapshot); state.rollbacks++; throw error }
  }
  const receiptApi = {
    POST: async req => {
      if (options.receiptFailure) return Response.json({ error: 'Receipt creation failed' }, { status: 403 })
      state.payload = await req.json()
      state.receipt = { ...state.payload, id: 101 }
      return Response.json(state.receipt, { status: 201 })
    },
    PUT: async req => {
      if (options.deleteFailure) return Response.json({ error: 'Receipt deletion failed' }, { status: 403 })
      state.receipt = await req.json()
      return Response.json(state.receipt)
    },
  }
  const receipts = load('app/api/pos/_receipts.ts', {
    'next/server': next, '@/lib/database': sql, '@/app/api/receipts/route': receiptApi,
    '@/lib/pos-receipt': receiptLogic,
    '@/app/api/receipts/_lib': { ...receiptLib, getVoucherNumberSettings: async () => ({ prefix: 'R', startNumber: 1 }), nextVoucherSequence: async () => 1 },
  })
  const salesLib = { ensureTables: async () => {}, generateSalesVoucherCode: async () => 'INV100', SALES_INVOICE_VCH_TYPE: 12, RETURN_SELL_VCH_TYPE: 16, ITEM_ACCOUNT_VCH_TYPES: [12,16], reverseSalesVoucherStockMovement: async () => {}, fetchSalesVoucherItems: async () => state.invoice.items }
  const route = load('app/api/pos/sales/route.ts', {
    'next/server': next, '@/lib/database': { default: sql, withTenantTransaction: transaction, __esModule: true },
    '@/app/api/sales-vouchers/route': { POST: async req => {
      const data = await req.json()
      state.invoice = { ...invoice, ...data, id: 100 }
      state.invoiceCreates++
      state.journal = data.pos_payments.filter(row => row.amount > 0).map((row, index) => ({ account_id: row.account_id, amount: row.amount, order_no: index + 1 }))
      return Response.json(state.invoice, { status: 201 })
    } },
    '@/app/api/stock-vouchers/route': {}, '@/app/api/stock-vouchers/_lib': {}, '@/app/api/sales-vouchers/_lib': salesLib,
    '../_lib': { ensurePosTables: async () => {}, getOpenPosSession: async () => ({ id: 1, shift_guid: 'shift' }), getPosPoint: async () => options.noWalkIn ? { ...point, walk_in_account_id: null } : point, requestBranchId: () => 1, requestUserId: () => 'user' },
    '@/lib/pos-currencies': { getPosCurrencies: async () => [{ currency_id: 1, rate_to_point: 1, exchange_rate: 1 }, { currency_id: 2, rate_to_point: 3.5, exchange_rate: 3.5 }] },
    '@/lib/pos-receipt': receiptLogic, '../_receipts': receipts,
  })
  const salesRoute = load('app/api/sales-vouchers/route.ts', {
    'next/server': next, '@/lib/database': { default: sql, withTenantTransaction: transaction, __esModule: true },
    '@/app/api/pos/_receipts': receipts, './_lib': salesLib, '@/app/api/stock-vouchers/_lib': {},
    '@/app/api/pos/_session-payments': load('app/api/pos/_session-payments.ts', { '@/lib/database': sql }),
    '@/lib/transaction-permissions': { transactionFamilyForVoucherType: () => 'sales_invoice', authorizeTransaction: async () => ({ ok: true, branchId: 1 }) },
  })
  return { state, route, salesRoute, receipts }
}

const cheque = { payment_method: 'cheque', amount: 40, reference: 'CHK1', cheque_account: '123', bank_id: 1, branch_id: 1, due_date: '2099-01-01' }
const card = { payment_method: 'card', amount: 30, reference: '4111111111111111', card_type_id: 1, card_expiry: '2099-01' }
const cash = { payment_method: 'cash', amount: 30 }
const payload = payments => ({ pos_client_sale_id: 'unique-sale', pos_point_id: 1, pos_session_id: 1, pos_customer_id: 50, pos_mode: 'sale', account_id: 99, customer_name: 'Walk-in', rate: 1, items: [{ product_id: 1, price: 100, quantity: 1 }], pos_payments: payments })

test('mixed collection charges the selected customer and posts cash, cheque and card only on the receipt', async () => {
  const { state, route } = harness()
  const response = await route.POST(request(payload([cash, cheque, card])))
  assert.equal(response.status, 201)
  assert.equal(state.invoice.account_id, 50)
  assert.equal(state.invoice.customer_name, 'Selected customer')
  assert.equal(state.invoice.pos_receipt_voucher_id, 101)
  assert.deepEqual([state.payload.cash_amount, state.payload.check_amount, state.payload.credit_card_amount, state.payload.amount], [30,40,30,100])
  assert.ok(state.journal.every(row => row.account_id === 50))
  const journal = receiptLib.buildJournalRows(state.payload, 4)
  assert.equal(journal.filter(row => row.credit_debit === 1).reduce((sum,row) => sum + row.amount,0), 100)
  assert.equal(journal.filter(row => row.credit_debit === 2).reduce((sum,row) => sum + row.amount,0), 100)
  assert.equal(journal.find(row => row.credit_debit === 2).account_id, 50)
  assert.equal(state.payload.cards[0].card_no, '****1111')
  assert.equal(state.payload.cheques[0].cheq_owner_name, 'Selected customer')
  assert.equal(state.queries.filter(row => row.query.startsWith('INSERT INTO cheques_tbl')).length, 0)
  assert.equal((await response.json()).pos_receipt_voucher_id, 101)
})

test('account balances and gift cards are excluded from the receipt', async () => {
  assert.deepEqual(receiptLogic.posReceiptAmounts([cash, cheque, card, { payment_method: 'account', amount: 15 }, { payment_method: 'gift_card', amount: 5 }]), { cash_amount: 30, check_amount: 40, credit_card_amount: 30, amount: 100 })
  const { state, route } = harness()
  assert.equal((await route.POST(request(payload([{ ...cash, amount: 20 }, cheque, { payment_method: 'account', amount: 40 }])))).status, 201)
  assert.equal(state.payload.amount, 60)
  assert.equal(state.journal.reduce((sum,row) => sum + row.amount,0) - state.payload.amount, 40)
})

test('foreign cheque is evaluated for the receipt and stored in its original currency', async () => {
  const { state, route } = harness()
  const response = await route.POST(request(payload([{ ...cash, amount: 65 }, { ...cheque, currency_id: 2, currency_amount: 10, amount: 35 }])))
  assert.equal(response.status, 201)
  assert.equal(state.payload.check_amount, 35)
  const update = state.queries.find(row => row.query.startsWith('UPDATE cheques_tbl SET amount'))
  assert.deepEqual(update.values.slice(0,4), [10,2,3.5,101])
})

test('cash-only and account-only sales do not create receipts', async () => {
  for (const payment of [{ ...cash, amount: 100 }, { payment_method: 'account', amount: 100 }]) {
    const { state, route } = harness()
    assert.equal((await route.POST(request(payload([payment])))).status, 201)
    assert.equal(state.receipt, null)
  }
})

test('cheque and account payments require an actual selected customer', async () => {
  for (const payment of [cheque, { payment_method: 'account', amount: 100 }]) {
    const { state, route } = harness()
    assert.equal((await route.POST(request({ ...payload([payment]), pos_customer_id: null }))).status, 400)
    assert.equal(state.invoice, null)
  }
})

test('receipt failure and missing voucher book roll back invoice creation', async () => {
  for (const options of [{ receiptFailure: true }, { noBook: true }]) {
    const { state, route } = harness(options)
    const response = await route.POST(request(payload([cash, cheque, card])))
    assert.equal(response.status, options.receiptFailure ? 403 : 400)
    assert.equal(state.invoice, null)
    assert.equal(state.receipt, null)
    assert.equal(state.rollbacks, 1)
  }
})

test('retries do not create a second invoice or receipt', async () => {
  const { state, route } = harness()
  await route.POST(request(payload([cash, cheque, card])))
  const repeated = await route.POST(request(payload([cash, cheque, card])))
  assert.equal((await repeated.json()).duplicate, true)
  assert.equal(state.invoiceCreates, 1)
  assert.equal(state.invoice.pos_receipt_voucher_id, 101)
})

test('card-only payment creates a receipt containing the full card amount', async () => {
  const { state, route } = harness()
  assert.equal((await route.POST(request(payload([{ ...card, amount: 100 }])))).status, 201)
  assert.deepEqual([state.payload.cash_amount,state.payload.check_amount,state.payload.credit_card_amount], [0,0,100])
  assert.equal(state.invoice.account_id, point.walk_in_account_id)
  assert.equal(state.payload.to_account_id, point.walk_in_account_id)
})

test('cash and card use the walk-in customer and a linked receipt with both amounts', async () => {
  for (const customerId of [null, 50]) {
    const { state, route } = harness()
    const response = await route.POST(request({ ...payload([{ ...card, amount: 60 }]), pos_customer_id: customerId, cash_currency_amounts: [{ currency_id: 1, amount: 40 }] }))
    assert.equal(response.status, 201)
    assert.equal(state.invoice.account_id, point.walk_in_account_id)
    assert.equal(state.invoice.customer_name, '\u0639\u0645\u064a\u0644 \u0646\u0642\u062f\u064a')
    assert.equal(state.payload.account_id, point.walk_in_account_id)
    assert.equal(state.payload.to_account_id, point.walk_in_account_id)
    assert.deepEqual([state.payload.cash_amount,state.payload.check_amount,state.payload.credit_card_amount,state.payload.amount], [40,0,60,100])
    assert.equal(state.invoice.pos_receipt_voucher_id, state.receipt.id)
    assert.ok(state.journal.every(row => row.account_id === point.walk_in_account_id))
  }
})

test('card sales without a valid walk-in account save both vouchers as cash customer with balanced settlement', async () => {
  for (const options of [{ noWalkIn: true }, { invalidWalkIn: true }]) {
    for (const cashAmount of [0, 40]) {
      const { state, route } = harness(options)
      const response = await route.POST(request({ ...payload([{ ...card, amount: 100 - cashAmount }]), pos_customer_id: null, account_id: null, cash_currency_amounts: [{ currency_id: 1, amount: cashAmount }] }))
      assert.equal(response.status, 201)
      assert.equal(state.invoice.account_id, null)
      assert.equal(state.invoice.customer_name, 'عميل نقدي')
      assert.equal(state.payload.account_id, null)
      assert.equal(state.payload.customer_name, 'عميل نقدي')
      assert.equal(state.payload.to_account_id, point.cash_account_id)
      assert.deepEqual([state.payload.cash_amount, state.payload.credit_card_amount, state.payload.amount], [cashAmount, 100 - cashAmount, 100])
      assert.ok(state.journal.every(row => row.account_id === point.cash_account_id))
      const journal = receiptLib.buildJournalRows(state.payload, 4)
      assert.equal(journal.filter(row => row.credit_debit === 1).reduce((sum, row) => sum + row.amount, 0), 100)
      assert.equal(journal.filter(row => row.credit_debit === 2).reduce((sum, row) => sum + row.amount, 0), 100)
      assert.equal(journal.find(row => row.credit_debit === 2).account_id, point.cash_account_id)
      assert.equal(state.invoice.pos_receipt_voucher_id, state.receipt.id)
    }
  }
})

test('cash and card save as walk-in without a configured or active walk-in account', async () => {
  for (const options of [{ noWalkIn: true }, { invalidWalkIn: true }]) {
    for (const customerId of [null, 50]) {
      const { state, route } = harness(options)
      const response = await route.POST(request({ ...payload([{ ...card, amount: 60 }]), pos_customer_id: customerId, cash_currency_amounts: [{ currency_id: 1, amount: 40 }] }))
      assert.equal(response.status, 201)
      assert.equal(state.invoice.account_id, null)
      assert.equal(state.invoice.customer_name, 'عميل نقدي')
      assert.equal(state.payload.account_id, null)
      assert.equal(state.payload.customer_name, 'عميل نقدي')
      assert.equal(state.payload.to_account_id, point.cash_account_id)
      assert.deepEqual([state.payload.cash_amount, state.payload.credit_card_amount, state.payload.amount], [40, 60, 100])
      assert.equal(state.invoice.pos_receipt_voucher_id, state.receipt.id)
      assert.ok(state.journal.every(row => row.account_id === point.cash_account_id))
      assert.equal(state.rollbacks, 0)
    }
  }
})

test('failure after receipt creation rolls back both vouchers', async () => {
  const { state, route } = harness({ cashFailure: true })
  assert.equal((await route.POST(request(payload([cash, cheque, card])))).status, 500)
  assert.equal(state.invoice, null)
  assert.equal(state.receipt, null)
  assert.equal(state.rollbacks, 1)
})

test('invoice cancellation preserves items, totals and linked receipt details', async () => {
  const { state, route, salesRoute } = harness()
  await route.POST(request(payload([cash, cheque, card])))
  const response = await salesRoute.PUT(request({ ...state.invoice, status: 3, items: [] }))
  assert.equal(response.status, 200)
  assert.equal(state.invoice.status, 3)
  assert.equal(state.receipt.status, 3)
  assert.equal(state.invoice.amount, 100)
  assert.equal(state.receipt.amount, 100)
  assert.equal(state.receipt.cheques.length, 1)
  assert.equal(state.receipt.cards.length, 1)
  assert.deepEqual((await response.json()).items, state.invoice.items)
  assert.equal(state.invoice.items.length, 1)
  for (const table of ['cheques_tbl','voucher_cards_detail_tbl','voucher_journal_detail_tbl','voucher_items_tbl']) {
    assert.ok(!state.queries.some(row => row.query.startsWith(`DELETE FROM ${table}`)))
  }
})

test('failed receipt deletion or a subsequently processed cheque preserves both vouchers', async () => {
  for (const options of [{ deleteFailure: true }, { processedCheque: true }]) {
    const { state, route, salesRoute } = harness(options)
    await route.POST(request(payload([cash, cheque, card])))
    const response = await salesRoute.PUT(request({ ...state.invoice, status: 3, items: [] }))
    assert.equal(response.status, options.deleteFailure ? 403 : 409)
    assert.equal(state.invoice.status, 2)
    assert.equal(state.receipt.status, 2)
    assert.equal(state.rollbacks, 1)
  }
})

test('cancelling an invoice preserves an already cancelled linked receipt', async () => {
  const { state, route, salesRoute } = harness()
  await route.POST(request(payload([cash, cheque, card])))
  state.receipt.status = 3
  assert.equal((await salesRoute.PUT(request({ ...state.invoice, status: 3, items: [] }))).status, 200)
  assert.equal(state.receipt.cheques.length, 1)
  assert.equal(state.receipt.cards.length, 1)
})

test('repeated cancellation preserves the original invoice fields and rows', async () => {
  const { state, route, salesRoute } = harness()
  await route.POST(request(payload([cash, cheque, card])))
  for (let i = 0; i < 2; i++) {
    const response = await salesRoute.PUT(request({ ...state.invoice, status: 3, amount: 0, items: [], customer_name: 'Changed' }))
    assert.equal(response.status, 200)
    assert.equal(state.invoice.customer_name, 'Selected customer')
    assert.equal((await response.json()).items.length, 1)
    assert.equal(state.invoice.amount, 100)
  }
})

test('cancelling through the sales screen reverses linked shift cash once', async () => {
  const { state, route, salesRoute } = harness()
  await route.POST(request(payload([cash, cheque, card])))
  state.allocations = [{ voucher_id: 100, session_id: 1, payment_method: 'cash', amount: 30, currency_amount: 30, currency_id: 1 }]
  for (let i = 0; i < 2; i++) {
    assert.equal((await salesRoute.PUT(request({ ...state.invoice, status: 3 }))).status, 200)
  }
  const reversals = state.queries.filter(row => row.query.startsWith('UPDATE pos_sessions_tbl') && row.values[0] === -30)
  assert.equal(reversals.length, 1)
  assert.equal(state.allocations.length, 0)
  assert.equal(state.invoice.items.length, 1)
  assert.equal(state.receipt.status, 3)
})
