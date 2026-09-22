const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, mod, mod.exports)
  return mod.exports
}

const users = load('lib/pos-point-users.ts')
const { validatePosAccounts } = load('lib/pos-account-validation.ts')

test('POS users can be checked and unchecked with numeric or text ids', () => {
  let selected = users.togglePosPointUser([{ user_id: 7, is_default: true }], 8, true)
  assert.deepEqual(selected.map(row => row.user_id), ['7', '8'])
  selected = users.togglePosPointUser(selected, '7', true)
  assert.equal(selected.length, 2)
  assert.equal(selected[0].is_default, true)
  selected = users.togglePosPointUser(selected, 7, false)
  assert.deepEqual(selected.map(row => row.user_id), ['8'])
  assert.deepEqual(users.togglePosPointUser(selected, '8', false), [])
})

test('POS settings save optional accounts as null and selected autocomplete ids as numbers', async () => {
  const calls = []
  const sql = async (parts, ...values) => {
    const query = parts.join('?').replace(/\s+/g, ' ').trim()
    calls.push({ query, values })
    if (query.includes('UPPER(code)')) return []
    if (query.startsWith('SELECT id FROM')) return [{ id: values[0] }]
    if (query.startsWith('INSERT INTO pos_points_tbl')) return [{ id: 90 }]
    return []
  }
  const route = load('app/api/pos/points/route.ts', {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@/lib/database': sql,
    '@/app/api/sales-vouchers/_lib': { ensureTables: async () => {} },
    '../_lib': { ensurePosTables: async () => {} },
    '@/lib/pos-point-users': users,
  })
  const form = { code: 'P1', name: 'POS', branch_id: 1, main_warehouse_id: 1, currency_id: 2, sales_book_id: 3, price_category_id: 1,
    users: [{ user_id: 7 }, { user_id: '7' }, { user_id: 8 }], cash_account_id: '', card_account_id: null, cheque_account_id: '', tax_account_id: '', return_account_id: '', gift_account_id: '' }
  const save = data => route.POST(new Request('http://localhost/api/pos/points', { method: 'POST', body: JSON.stringify(data) }))
  assert.equal((await save(form)).status, 201)
  const insert = calls.find(call => call.query.startsWith('INSERT INTO pos_points_tbl'))
  const columns = insert.query.match(/pos_points_tbl\(([^)]+)\)/)[1].split(',')
  const values = Object.fromEntries(columns.map((column, index) => [column, insert.values[index]]))
  for (const field of ['cash_account_id', 'card_account_id', 'cheque_account_id', 'tax_account_id', 'return_account_id', 'gift_account_id']) assert.equal(values[field], null)
  assert.deepEqual(calls.filter(call => call.query.startsWith('INSERT INTO pos_point_users_tbl')).map(call => call.values[1]), ['7', '8'])
  calls.length = 0
  assert.equal((await save({ ...form, cash_account_id: '123', users: [] })).status, 201)
  const saved = calls.find(call => call.query.startsWith('INSERT INTO pos_points_tbl'))
  assert.equal(saved.values[columns.indexOf('cash_account_id')], 123)
  assert.equal(calls.some(call => call.query.startsWith('INSERT INTO pos_point_users_tbl')), false)
})

test('cashier only requires accounts for payment methods actually used', () => {
  assert.equal(validatePosAccounts({ cash_account_id: 10 }, [{ method: 'cash', amount: 20 }, { method: 'card', amount: 0 }], { mode: 'sale' }), null)
  for (const [method, label] of [['cash', 'الصندوق'], ['card', 'البطاقات'], ['cheque', 'الشيكات'], ['gift_card', 'الهدايا']]) {
    const issue = validatePosAccounts({}, [{ method, amount: 20 }], { mode: 'sale' })
    assert.ok(issue.includes(label))
    assert.match(issue, /تعريف نقطة البيع.*للمستخدم.*النظام/)
  }
  assert.equal(validatePosAccounts({}, [{ method: 'account', amount: 20 }], { mode: 'sale' }), null)
  assert.equal(validatePosAccounts({}, [], { mode: 'gift', taxAmount: 20 }), null)
  assert.match(validatePosAccounts({ card_account_id: 11 }, [{ method: 'card', amount: 20 }], { mode: 'sale' }), /الصندوق/)
  assert.equal(validatePosAccounts({ card_account_id: 11 }, [{ method: 'card', amount: 20 }], { mode: 'sale', customerAccountId: 50 }), null)
})

test('tax and returns use resolved defaults while retaining valid product return accounts', () => {
  assert.match(validatePosAccounts({}, [], { mode: 'sale', taxAmount: 1 }), /الضريبة/)
  assert.equal(validatePosAccounts({ tax_account_id: 22 }, [], { mode: 'sale', taxAmount: 1 }), null)
  assert.equal(validatePosAccounts({ return_account_id: 23 }, [], { mode: 'return', returnAccountIds: [null] }), null)
  assert.equal(validatePosAccounts({}, [], { mode: 'return', returnAccountIds: [24] }), null)
  assert.match(validatePosAccounts({}, [], { mode: 'return', returnAccountIds: [24, null] }), /المردودات/)
})
