const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function('require','module','exports',code)(name => { if (!(name in mocks)) throw Error(name); return mocks[name] },module,module.exports)
  return module.exports
}
const next = { NextResponse: { json: (data, options) => Response.json(data, options) } }
function setup({ status = 3, denied = false, found = true } = {}) {
  const voucher = { id: 42, vch_type: 4, vch_code: 'RA00000001', status, amount: 100 }
  const details = { cheques: [{ cheq_num: '123', amount: 40 }], cards: [{ card_no: '****1111', amount: 30 }], cash_amount: 30 }
  let bookLookups = 0
  const mocks = {
    'next/server': next,
    '@/lib/database': async (strings, ...values) => {
      const query = strings.join('?')
      if (query.includes('UPPER(vch_code)')) return found && values[0] === 4 && values[1] === voucher.vch_code ? [voucher] : []
      if (query.includes('vch_code =')) return found && values[1] === voucher.vch_code ? [voucher] : []
      if (query.includes('WHERE id =')) return values[0] === 42 ? [voucher] : []
      throw Error(query)
    },
    '../_lib': { ensureTables: async () => {}, getVoucherNumberSettings: async () => ({ prefix: 'R' }), buildVoucherCode: (_prefix,book,number) => `R${book}${String(number).padStart(8,'0')}`, resolveVoucherBookName: async id => { bookLookups++;return id ? 'A' : '' }, fetchDetails: async () => details },
    '@/lib/transaction-permissions': { authorizeStoredVoucher: async () => denied ? { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) } : { ok: true } },
  }
  return { resolver: load('app/api/receipts/resolve-code/route.ts',mocks), detail: load('app/api/receipts/[id]/route.ts',mocks), bookLookups: () => bookLookups }
}
test('full cancelled code resolves without a selected voucher book', async () => {
  const { resolver, bookLookups } = setup()
  const result = await resolver.GET(new Request('http://localhost/api/receipts/resolve-code?vch_type=4&raw=ra00000001'))
  assert.deepEqual(await result.json(), { code: 'RA00000001', exists: true, id: 42, status: 3 })
  assert.equal(bookLookups(), 0)
})
test('short code resolves a cancelled receipt within the selected book', async () => {
  const { resolver } = setup()
  const result = await resolver.GET(new Request('http://localhost/api/receipts/resolve-code?vch_type=4&vch_book_id=1&raw=1'))
  assert.equal((await result.json()).status, 3)
})
test('posted status remains posted rather than being relabelled cancelled', async () => {
  const { resolver } = setup({ status: 2 })
  const result = await resolver.GET(new Request('http://localhost/api/receipts/resolve-code?vch_type=4&raw=RA00000001'))
  assert.equal((await result.json()).status, 2)
})
test('cancelled receipt details load with asynchronous route parameters', async () => {
  const { detail } = setup()
  const result = await detail.GET(new Request('http://localhost/api/receipts/42'), { params: Promise.resolve({ id: '42' }) })
  assert.equal(result.status, 200)
  const data = await result.json()
  assert.equal(data.status, 3)
  assert.equal(data.amount, 100)
  assert.equal(data.cheques.length, 1)
  assert.equal(data.cards.length, 1)
})
test('exact and short lookups respect stored voucher permissions', async () => {
  const { resolver } = setup({ denied: true })
  for (const raw of ['RA00000001','1']) assert.equal((await resolver.GET(new Request(`http://localhost/api/receipts/resolve-code?vch_type=4&vch_book_id=1&raw=${raw}`))).status, 403)
})
test('unknown numbers still support new vouchers', async () => {
  const { resolver } = setup({ found: false })
  const result = await resolver.GET(new Request('http://localhost/api/receipts/resolve-code?vch_type=4&vch_book_id=1&raw=2'))
  const data = await result.json()
  assert.equal(data.exists, false)
  assert.equal(data.code, 'RA00000002')
})
