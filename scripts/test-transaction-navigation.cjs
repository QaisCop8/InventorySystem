// Run: node --test scripts/test-transaction-navigation.cjs
// Executes the API handlers with an isolated database and authorization mock.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, dependencies) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

const next = { NextResponse: { json: (data, options) => Response.json(data, options) } }
const request = query => ({ nextUrl: new URL(`http://localhost/api/transaction-navigation?${new URLSearchParams(query)}`) })
const records = [
  { id: 2, vch_type: 12, status: 2, branch_id: 1 },
  { id: 8, vch_type: 12, status: 3, branch_id: 1 },
  { id: 12, vch_type: 17, status: 2, branch_id: 1 },
  { id: 16, vch_type: 12, status: 2, branch_id: 2 },
  { id: 20, vch_type: 12, status: 1, branch_id: 1 },
  { id: 35, vch_type: 12, status: 2, branch_id: 1 },
]
function harness(denied = false) {
  const queries = []
  const sql = async (parts, ...values) => {
    const query = parts.join('?').replace(/\s+/g, ' ')
    queries.push(query)
    assert.match(query, /status<>3 AND branch_id=ANY/)
    const [type, branches, skipPrevious, currentId, skipNext, nextId, order] = values
    const rows = records.filter(row => row.vch_type === type && row.status !== 3 && branches.includes(row.branch_id) && (skipPrevious || row.id < currentId) && (skipNext || row.id > nextId))
    rows.sort((a, b) => order === 'id DESC' ? b.id - a.id : a.id - b.id)
    return rows.slice(0, 1).map(({ id }) => ({ id }))
  }
  sql.unsafe = value => value
  const route = load('app/api/transaction-navigation/route.ts', {
    'next/server': next, '@/lib/database': sql,
    '@/lib/transaction-permissions': {
      transactionFamilyForVoucherType: type => ({ 12: 'sales_invoice', 17: 'purchase_invoice' })[type],
      authorizeTransaction: async () => denied ? { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) } : { ok: true, branchIds: [1] },
    },
  })
  return { route, queries }
}

test('all four directions select records from the API, including records absent from the loaded page', async () => {
  const { route } = harness()
  for (const [direction, expected] of [['first', 2], ['previous', 2], ['next', 35], ['last', 35]]) {
    const response = await route.GET(request({ direction, currentId: 20, vch_type: 12 }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: expected })
  }
})
test('navigation excludes cancelled vouchers, other voucher types and unauthorized branches', async () => {
  const { route } = harness()
  assert.deepEqual(await (await route.GET(request({ direction: 'next', currentId: 2, vch_type: 12 }))).json(), { id: 20 })
  assert.deepEqual(await (await route.GET(request({ direction: 'first', vch_type: 17 }))).json(), { id: 12 })
})
test('new records navigate to the last or first saved voucher', async () => {
  const { route } = harness()
  for (const [direction, expected] of [['previous', 35], ['next', 2]]) {
    assert.deepEqual(await (await route.GET(request({ direction, currentId: 0, vch_type: 12 }))).json(), { id: expected })
  }
})
test('boundaries return null and do not wrap or repeat the current voucher', async () => {
  const { route } = harness()
  for (const [direction, currentId] of [['previous', 2], ['next', 35]]) {
    assert.equal(await (await route.GET(request({ direction, currentId, vch_type: 12 }))).json(), null)
  }
})
test('invalid navigation and denied permissions never query transaction data', async () => {
  const { route, queries } = harness()
  for (const query of [{ direction: 'bad', vch_type: 12 }, { direction: 'next', vch_type: 999 }, { direction: 'next', vch_type: 12, currentId: -1 }, { direction: 'next', vch_type: 12, currentId: 'invalid' }]) {
    assert.equal((await route.GET(request(query))).status, 400)
  }
  assert.equal(queries.length, 0)
  const blocked = harness(true)
  assert.equal((await blocked.route.GET(request({ direction: 'first', vch_type: 12 }))).status, 403)
  assert.equal(blocked.queries.length, 0)
})
test('receipt and credit-note navigation await route parameters and return fresh details', async () => {
  for (const resource of ['receipts', 'credit-notes']) {
    const queries = []
    const sql = async (parts, ...values) => { queries.push(parts.join('?')); return [{ id: 35, vch_type: resource === 'receipts' ? 4 : 6 }] }
    const route = load(`app/api/${resource}/navigation/[navigationType]/route.ts`, {
      'next/server': next, '@/lib/database': sql,
      '@/lib/transaction-permissions': { transactionFamilyForVoucherType: () => 'receipt', authorizeTransaction: async () => ({ ok: true, branchIds: [1] }) },
      '../../_lib': { ensureTables: async () => {}, fetchDetails: async id => ({ items: [{ voucher_id: id }] }), fetchCreditNoteDetails: async id => ({ items: [{ voucher_id: id }] }) },
    })
    const response = await route.GET(request({ currentId: 20, vch_type: resource === 'receipts' ? 4 : 6 }), { params: Promise.resolve({ navigationType: 'next' }) })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).items, [{ voucher_id: 35 }])
    assert.match(queries[0], /id > .*ORDER BY id ASC LIMIT 1/)
  }
})
