const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, dependencies) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => dependencies[name], mod, mod.exports)
  return mod.exports
}
function harness(existing = true) {
  const queries = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); queries.push({ query, values })
    if (query.includes('UPDATE pos_sale_drafts_tbl')) return existing ? [{ id: 7, draft_code: 'TMP-ORIGINAL' }] : []
    if (query.includes('INSERT INTO')) return [{ id: 8, draft_code: 'TMP-NEW' }]
    return []
  }
  const routes = load('app/api/pos/drafts/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/database': { __esModule: true, default: sql },
    '../_lib': { ensurePosTables: async () => {}, getPosPoint: async () => ({ id: 2 }), getOpenPosSession: async () => ({ id: 3 }), requestUserId: () => 4, requestBranchId: () => 1 },
  })
  return { queries, save: (method, id) => routes[method]({ method, json: async () => ({ id, pos_point_id: 2, note: 'updated', items: [{ product_id: 9, quantity: 5, price: 10 }] }) }) }
}
test('saving an opened draft updates the same record and preserves its code', async () => {
  const { save, queries } = harness()
  const result = await save('PUT', 7)
  assert.equal(result.status, 200)
  assert.equal(result.body.id, 7)
  assert.equal(result.body.draft_code, 'TMP-ORIGINAL')
  assert.equal(queries.length, 1)
  assert.match(queries[0].query, /WHERE id=\? AND pos_point_id=\? AND user_id=\? AND status='draft'/)
  assert.ok(queries[0].values.includes('updated'))
  assert.doesNotMatch(queries[0].query, /SET\s+draft_code|INSERT/)
})
test('missing or inaccessible drafts are rejected instead of duplicated', async () => {
  const { save, queries } = harness(false)
  assert.equal((await save('PUT', 7)).status, 409)
  assert.equal(queries.some(query => query.query.includes('INSERT')), false)
  assert.equal((await save('PUT', null)).status, 400)
})
test('new drafts still create a record', async () => {
  const { save } = harness()
  const result = await save('POST', null)
  assert.equal(result.status, 201)
  assert.equal(result.body.id, 8)
})
