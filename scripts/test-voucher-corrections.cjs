const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, dependencies = {}) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || {}, mod, mod.exports)
  return mod.exports
}
test('cheque rollback rejects newer operations and changed status before any writes', async () => {
  for (const changes of [{ latest_log_voucher_id: 101 }, { last_voucher_id: 101 }, { status_id: 5 }]) {
    const queries = []
    const sql = async (strings) => {
      const query = strings.join('?'); queries.push(query)
      if (query.includes('SELECT c.id,c.cheq_num')) return [{ id: 7, cheq_num: '1236', status_id: 7, latest_status_id: 7, last_voucher_id: 100, latest_log_id: 20, latest_log_voucher_id: 100, ...changes }]
      return []
    }
    const lib = load('app/api/cheques/_lib.ts', { '@/lib/database': { __esModule: true, default: sql } })
    const result = await lib.rollbackChequeOperationsForVoucher(100)
    assert.ok(result.error)
    assert.equal(result.restored, 0)
    assert.equal(queries.some(q => q.trimStart().startsWith('UPDATE')), false)
    assert.match(queries.find(q => q.includes('SELECT c.id,c.cheq_num')), /ORDER BY l.id DESC/)
  }
})
test('optional payroll module is only touched when journal_id exists', async () => {
  for (const installed of [false, true]) {
    const queries = []
    const sql = async strings => { const query = strings.join('?'); queries.push(query); return query.includes('pg_attribute') && installed ? [{}] : [] }
    const lib = load('app/api/journal-vouchers/_lib.ts', { '@/lib/database': { __esModule: true, default: sql } })
    await lib.unlinkPayrollJournal(100)
    assert.equal(queries.some(q => q.includes('UPDATE payroll_tbl')), installed)
  }
})

test('deleting a multi-cheque journal validates every cheque before restoring any and locks before reading history', async () => {
  const queries = []
  const sql = async strings => {
    const query = strings.join('?'); queries.push(query)
    if (query.includes('SELECT c.id,c.cheq_num')) return [
      { id: 1, cheq_num: '1001', status_id: 7, latest_status_id: 7, last_voucher_id: 100, latest_log_id: 20, latest_log_voucher_id: 100 },
      { id: 2, cheq_num: '1002', status_id: 7, latest_status_id: 7, last_voucher_id: 101, latest_log_id: 21, latest_log_voucher_id: 101 },
    ]
    return []
  }
  const lib = load('app/api/cheques/_lib.ts', { '@/lib/database': { __esModule: true, default: sql } })
  const result = await lib.rollbackChequeOperationsForVoucher(100)
  assert.match(result.error, /1002/)
  assert.equal(result.restored, 0)
  assert.equal(queries.some(query => query.trimStart().startsWith('UPDATE')), false)
  assert.ok(queries.findIndex(query => query.includes('ORDER BY c.id FOR UPDATE')) < queries.findIndex(query => query.includes('latest_log_id')))
})

test('latest cheque journal restores previous status and archives only its latest operation', async () => {
  const queries = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); queries.push({ query, values })
    if (query.includes('SELECT c.id,c.cheq_num')) return [{ id: 1, cheq_num: '1001', status_id: 7, latest_status_id: 7, last_voucher_id: 100, latest_log_id: 20, latest_log_voucher_id: 100, previous_status_id: 5, latest_previous_voucher_id: 90 }]
    return []
  }
  const lib = load('app/api/cheques/_lib.ts', { '@/lib/database': { __esModule: true, default: sql } })
  const result = await lib.rollbackChequeOperationsForVoucher(100)
  assert.equal(result.restored, 1)
  assert.equal(result.error, undefined)
  assert.equal(queries.find(query => query.query.includes('UPDATE cheques_tbl')).values[0], 5)
  assert.deepEqual(queries.find(query => query.query.includes('SET status=9')).values, [20, 100])
})
test('outgoing reissue matches ShamelAPI operation 15: debit cheque account, credit customer', () => {
  const source = fs.readFileSync('app/api/cheques/operations/route.ts', 'utf8')
  const start = source.indexOf('function resolveAccountMovement(')
  const end = source.indexOf('\nexport async function', start)
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const resolve = new Function(code + ';return resolveAccountMovement')()
  const result = resolve({ code: 'repay' }, { current_account_id: 10, customer_id: 10, rec_cheq_account_id: 20 }, null)
  assert.equal(result.debitAccountId, 20)
  assert.equal(result.creditAccountId, 10)
  assert.equal(result.nextCurrentAccountId, 20)
})
test('posted and deleted vouchers bypass change comparison across shared transaction forms', () => {
  for (const file of ['components/accounting/unified-journal.tsx', 'components/accounting/unified-receipt-voucher.tsx', 'components/accounting/unified-credit-note.tsx', 'components/inventory/unified-stock-voucher.tsx', 'components/sales/unified-sales-delivery.tsx']) {
    const source = fs.readFileSync(file, 'utf8')
    const body = source.slice(source.indexOf('const guardedAction =')).match(/=> \{([\s\S]*?)\n  \}/)[1]
    for (const status of [2, 3]) {
      let called = 0
      new Function('form', 'action', body)({ status }, () => called++)
      assert.equal(called, 1, file)
    }
  }
})
