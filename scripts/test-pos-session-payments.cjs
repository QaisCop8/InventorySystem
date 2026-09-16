// Run: node --test scripts/test-pos-session-payments.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../app/api/pos/_session-payments.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

function setup(voucherType = 12) {
  const voucher = { id: 1, vch_type: voucherType, vch_code: 'INV1', pos_session_id: 5, pos_point_id: 7, status: 3 }
  const state = {
    cash: 155, currencies: { 1: 120, 2: 10 }, giftBalance: 0,
    payments: [
      { voucher_id: 1, session_id: 5, payment_method: 'cash', amount: 20, currency_id: 1, currency_amount: 20 },
      { voucher_id: 1, session_id: 5, payment_method: 'cash', amount: 35, currency_id: 2, currency_amount: 10 },
      { voucher_id: 1, session_id: 5, payment_method: 'card', amount: 30 },
      { voucher_id: 1, session_id: 5, payment_method: 'cheque', amount: 40 },
    ],
    movements: ['INV1', 'OTHER'], mutations: [],
  }
  const sql = async (strings, ...values) => {
    const query = strings.join('?').replace(/\s+/g, ' ').trim()
    if (query.startsWith('SELECT * FROM pos_sale_payments_tbl')) return state.payments.filter(row => row.voucher_id === values[0])
    if (query.startsWith('SELECT currency_id FROM pos_points_tbl')) return [{ currency_id: 1 }]
    if (query.startsWith('SELECT v.*')) return state.payments.length && voucher.status === 3 ? [voucher] : []
    state.mutations.push(query)
    if (query.startsWith('UPDATE pos_sessions_tbl')) { assert.equal(values[1], 5); state.cash += values[0] }
    if (query.startsWith('UPDATE pos_session_currencies_tbl')) { assert.equal(values[1], 5); state.currencies[values[2]] += values[0] }
    if (query.startsWith('UPDATE pos_gift_cards_tbl')) state.giftBalance += values[0]
    if (query.startsWith('DELETE FROM pos_cash_movements_tbl')) { assert.equal(values[0], 5); state.movements = state.movements.filter(value => value !== values[1]) }
    if (query.startsWith('DELETE FROM pos_sale_payments_tbl')) state.payments = state.payments.filter(row => row.voucher_id !== values[0])
    return []
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(() => sql, module, module.exports)
  return { state, voucher, ...module.exports }
}

test('cancellation removes cash in point currency and original currencies, not card or cheque values', async () => {
  const { state, voucher, reversePosSessionPayments } = setup()
  await reversePosSessionPayments(voucher)
  assert.equal(state.cash, 100)
  assert.deepEqual(state.currencies, { 1: 100, 2: 0 })
  assert.deepEqual(state.movements, ['OTHER'])
  assert.equal(state.payments.length, 0)
})

test('cancelling a cash return adds its cash back to custody', async () => {
  const { state, voucher, reversePosSessionPayments } = setup(16)
  await reversePosSessionPayments(voucher)
  assert.equal(state.cash, 210)
  assert.deepEqual(state.currencies, { 1: 140, 2: 20 })
})

test('repeated reversal cannot deduct custody twice', async () => {
  const { state, voucher, reversePosSessionPayments } = setup()
  await reversePosSessionPayments(voucher)
  const after = structuredClone(state)
  await reversePosSessionPayments(voucher)
  assert.deepEqual(state, after)
})

test('opening custody repairs previously cancelled invoices exactly once', async () => {
  const { state, reconcileCancelledPosPayments } = setup()
  assert.equal(await reconcileCancelledPosPayments(5), true)
  assert.equal(state.cash, 100)
  assert.equal(await reconcileCancelledPosPayments(5), false)
  assert.equal(state.cash, 100)
})

test('active invoices are not reconciled away', async () => {
  const { state, voucher, reconcileCancelledPosPayments } = setup()
  voucher.status = 2
  assert.equal(await reconcileCancelledPosPayments(5), false)
  assert.equal(state.cash, 155)
  assert.equal(state.payments.length, 4)
})

test('gift-card redemption is restored once without changing cash', async () => {
  const { state, voucher, reversePosSessionPayments } = setup()
  state.payments = [{ voucher_id: 1, payment_method: 'gift_card', amount: 25, reference: 'GIFT1' }]
  await reversePosSessionPayments(voucher)
  await reversePosSessionPayments(voucher)
  assert.equal(state.giftBalance, 25)
  assert.equal(state.cash, 155)
})

test('legacy cash allocations use the invoice session and point currency', async () => {
  const { state, voucher, reversePosSessionPayments } = setup()
  state.payments = [{ voucher_id: 1, payment_method: 'cash', amount: 20 }]
  await reversePosSessionPayments(voucher)
  assert.equal(state.cash, 135)
  assert.equal(state.currencies[1], 100)
})
