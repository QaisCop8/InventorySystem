const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }

function load(file, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

function validVoucher(overrides = {}) {
  return {
    id: 0, vch_type: 6, vch_code: 'C1', vch_date: '2026-10-13', rate: 1,
    branch_id: 1, currency_id: 1, account_id: 10, debit_account_id: 20,
    vat_account_id: null, vat_percent: 0, vat: 0,
    amount_journal_type_8: 100, amount: 100, status: 1, ...overrides,
  }
}

function api(data, { validAccountIds = [30], currencyError = null } = {}) {
  const queries = [], currencyChecks = [], journalWrites = []
  const sql = async (parts, ...values) => {
    const query = parts.join('?')
    queries.push({ query, values })
    if (query.includes('SELECT id FROM account_tbl')) return validAccountIds.includes(values[0]) ? [{ id: values[0] }] : []
    if (query.includes('SELECT status FROM voucher_header_tbl')) return [{ status: 1 }]
    if (/\b(?:INSERT INTO|UPDATE) voucher_header_tbl\b/.test(query)) return [{ ...data, id: data.id || 200 }]
    return []
  }
  const lib = load('app/api/credit-notes/_lib.ts', {
    '@/lib/database': { __esModule: true, default: sql },
    '../receipts/_lib': {
      JOURNAL_TYPE_COUNTER_ACCOUNT: 1,
      validateJournalAccountCurrencies: async (rows, currency) => {
        currencyChecks.push({ rows, currency })
        return currencyError
      },
    },
    '../voucher-book-permissions/_lib': {},
  })
  const route = load('app/api/credit-notes/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/database': { __esModule: true, default: sql },
    './_lib': {
      ...lib,
      ensureTables: async () => {},
      saveJournalRows: async (id, rows) => journalWrites.push({ id, rows }),
      fetchCreditNoteDetails: async () => ({}),
      getCreditNoteNumberSettings: async () => ({ prefix: 'C', startNumber: 1 }),
      resolveVoucherBookName: async () => '',
    },
    '@/lib/transaction-permissions': {
      transactionFamilyForVoucherType: type => [6, 7].includes(type) ? 'credit_note' : null,
      authorizeTransaction: async () => ({ ok: true, branchId: 1, branchIds: [1] }),
    },
    '@/lib/working-period': { workingPeriodErrorMessage: () => null },
  })
  return {
    lib, queries, currencyChecks, journalWrites,
    save: method => route[method]({ url: 'http://test/api/credit-notes', json: async () => data }),
  }
}

function clientValidator(voucherType) {
  const file = 'components/accounting/credit-note.tsx'
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  let initializer
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'validateVoucher') initializer = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(initializer)
  const code = ts.transpileModule(`const validateVoucher = ${initializer}`, { compilerOptions }).outputText
  return new Function('voucherType', 'voucherBooks', 'currencies', code + ';return validateVoucher')(voucherType, [], [{ id: 1 }])
}

test('credit/debit note form requires a VAT account for positive VAT percentage or amount only', () => {
  for (const type of [6, 7]) {
    const validate = clientValidator(type)
    assert.equal(validate(validVoucher()), null)
    assert.equal(validate(validVoucher({ vat: null, vat_percent: '0' })), null)
    for (const tax of [{ vat_percent: 5 }, { vat: 5 }, { vat_percent: 5, vat: 5 }]) {
      for (const account of [null, undefined, 0, -1, 1.5, 'invalid']) {
        assert.equal(validate(validVoucher({ ...tax, vat_account_id: account })), 'يجب اختيار حساب الضريبة')
      }
      assert.equal(validate(validVoucher({ ...tax, vat_account_id: 30 })), null)
    }
  }
})

test('creating/updating and posting credit/debit notes reject missing VAT accounts before voucher writes', async () => {
  for (const vch_type of [6, 7]) for (const status of [1, 2]) for (const method of ['POST', 'PUT']) {
    for (const tax of [{ vat_percent: 5 }, { vat: 5, amount: 105 }]) {
      const data = validVoucher({ id: method === 'PUT' ? 200 : 0, vch_type, status, ...tax })
      const subject = api(data)
      const response = await subject.save(method)
      assert.equal(response.status, 400)
      assert.equal(response.body.error, 'يجب اختيار حساب الضريبة')
      assert.equal(subject.queries.some(({ query }) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(query)), false)
      assert.deepEqual(subject.journalWrites, [])
    }
  }
})

test('zero VAT notes can save and post without a VAT account and omit a VAT journal row', async () => {
  for (const vch_type of [6, 7]) for (const status of [1, 2]) for (const method of ['POST', 'PUT']) {
    const data = validVoucher({ id: method === 'PUT' ? 200 : 0, vch_type, status })
    const subject = api(data)
    const response = await subject.save(method)
    assert.equal(response.status, method === 'POST' ? 201 : 200)
    assert.equal(subject.queries.some(({ query }) => query.includes('FROM account_tbl')), false)
    assert.equal(subject.journalWrites.length, 1)
    assert.equal(subject.journalWrites[0].rows.length, 2)
    const write = subject.queries.find(({ query }) => /^\s*(INSERT|UPDATE)\b/.test(query))
    assert.ok(write)
    assert.ok(!write.values.includes(undefined))
  }
})

test('VAT account existence and currency are validated even when a positive VAT percentage rounds to zero VAT', async () => {
  for (const method of ['POST', 'PUT']) {
    const data = validVoucher({ id: method === 'PUT' ? 200 : 0, vat_percent: 0.0001, vat: 0, vat_account_id: 30 })
    const missing = api(data, { validAccountIds: [] })
    assert.equal((await missing.save(method)).body.error, 'حساب الضريبة غير صالح')
    assert.deepEqual(missing.journalWrites, [])
    const incompatible = api(data, { currencyError: 'currency mismatch' })
    assert.equal((await incompatible.save(method)).body.error, 'currency mismatch')
    assert.deepEqual(incompatible.currencyChecks[0], { rows: [{ account_id: 30 }], currency: 1 })
    assert.deepEqual(incompatible.journalWrites, [])
    const compatible = api(data)
    assert.equal((await compatible.save(method)).status, method === 'POST' ? 201 : 200)
    assert.equal(compatible.journalWrites[0].rows.length, 2)
  }
})

test('positive VAT saves balanced credit/debit note journal rows against the validated account', async () => {
  for (const vch_type of [6, 7]) for (const method of ['POST', 'PUT']) {
    const data = validVoucher({ id: method === 'PUT' ? 200 : 0, vch_type, vat_percent: 5, vat: 5, amount: 105, vat_account_id: 30 })
    const subject = api(data)
    assert.equal((await subject.save(method)).status, method === 'POST' ? 201 : 200)
    const rows = subject.journalWrites[0].rows
    assert.equal(rows.length, 3)
    assert.equal(rows[0].account_id, 30)
    assert.equal(rows[0].amount, 5)
    assert.equal(rows[0].credit_debit, vch_type === 6 ? 1 : 2)
    assert.equal(rows.reduce((sum, row) => sum + (row.credit_debit === 1 ? row.amount : -row.amount), 0), 0)
  }
})

test('logical cancellation remains available for a legacy VAT note with no VAT account', async () => {
  const subject = api(validVoucher({ id: 200, status: 3, vat_percent: 5 }))
  assert.equal((await subject.save('PUT')).status, 200)
  assert.deepEqual(subject.journalWrites, [])
  assert.equal(subject.queries.some(({ query }) => query.includes('FROM account_tbl')), false)
})
