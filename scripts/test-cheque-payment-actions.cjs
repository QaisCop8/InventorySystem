const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function harness({ status = 1, changed = [], rollbackError, denied = false } = {}) {
  const calls = [], permissions = []
  let rollbacks = 0
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); calls.push({ query, values })
    if (query.includes('SELECT id,status')) return [{ id: 42, status }]
    if (query.includes('SELECT c.cheq_num')) return changed
    return [{ id: 42 }]
  }
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/database': { __esModule: true, default: sql, withTenantTransaction: fn => fn() },
    '@/lib/transaction-permissions': { authorizeStoredVoucher: async (_request, _id, action) => {
      permissions.push(action)
      return denied ? { ok: false, response: { status: 403 } } : { ok: true }
    } },
    '@/app/api/cheques/_lib': { rollbackChequeOperationsForVoucher: async () => { rollbacks++; return { error: rollbackError, restored: 2 } } },
    '../_lib': { ensureChequePaymentTables: async () => {}, fetchChequePaymentVoucher: async () => ({ id: 42 }) },
  }
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync('app/api/cheque-payment-vouchers/[id]/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(name => dependencies[name], mod, mod.exports)
  return { ...mod.exports, calls, permissions, rollbackCount: () => rollbacks }
}
const params = { params: Promise.resolve({ id: '42' }) }
test('save and review print do not post an existing saved voucher', async () => {
  for (const action of ['save', 'save_print']) {
    const h = harness()
    assert.equal((await h.PATCH({ json: async () => ({ action }) }, params)).status, 200)
    assert.deepEqual(h.permissions, ['update'])
    assert.equal(h.calls.some(c => c.query.trimStart().startsWith('UPDATE')), false)
  }
})
test('posting checks permission and marks original printing only when requested', async () => {
  for (const action of ['post', 'post_print']) {
    const h = harness()
    assert.equal((await h.PATCH({ json: async () => ({ action }) }, params)).status, 200)
    assert.deepEqual(h.permissions, ['post'])
    assert.deepEqual(h.calls.find(c => c.query.trimStart().startsWith('UPDATE')).values, [action === 'post_print' ? 1 : 0, 42])
  }
  const denied = harness({ denied: true })
  assert.equal((await denied.PATCH({ json: async () => ({ action: 'post' }) }, params)).status, 403)
  assert.equal(denied.calls.length, 0)
})
test('cancelled or posted vouchers cannot be posted again', async () => {
  for (const status of [2, 3]) {
    const h = harness({ status })
    assert.equal((await h.PATCH({ json: async () => ({ action: 'post' }) }, params)).status, 409)
    assert.equal(h.calls.some(c => c.query.trimStart().startsWith('UPDATE')), false)
  }
})
test('delete rejects changed cheque statuses before rollback', async () => {
  const h = harness({ changed: [{ cheq_num: '1236', status_id: 5, new_status_id: 7 }] })
  assert.equal((await h.DELETE({}, params)).status, 409)
  assert.equal(h.rollbackCount(), 0)
  assert.equal(h.calls.some(c => c.query.trimStart().startsWith('UPDATE')), false)
})
test('delete reverses unchanged cheques and cancels voucher', async () => {
  const h = harness({ changed: [{ cheq_num: '1236', status_id: 7, new_status_id: 7 }] })
  assert.equal((await h.DELETE({}, params)).status, 200)
  assert.equal(h.rollbackCount(), 1)
  assert.equal(h.calls.some(c => c.query.includes('SET status=3')), true)
})
