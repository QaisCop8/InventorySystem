const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, dependencies = {}, extra = '') {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const fallback = new Proxy({}, { get: (_target, name) => name === '__esModule' ? true : name })
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react/jsx-runtime') return require(name)
    return dependencies[name] || fallback
  }, mod, mod.exports)
  return mod.exports
}

const chequeLib = load('app/api/cheques/_lib.ts')
const { voucherHref } = load('lib/voucher-links.ts')
const returned = { id: 1236, cheq_num: '1236', cheq_type: 1, status_id: 5, status_name: 'راجع', due_date: '2026-01-01', business_date: '2026-09-21', has_operations: true }
const nextServer = { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) } }

function searchApi({ permitted = true, rows = [returned] } = {}) {
  const calls = [], permissions = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?')
    calls.push({ query, values, strings })
    return query.includes('FROM cheques_tbl c') ? rows : []
  }
  const mod = load('app/api/cheques/route.ts', {
    'next/server': nextServer,
    '@/lib/database': { __esModule: true, default: sql },
    '@/lib/tenant-auth': { getSessionUser: async () => ({ user_id: '7' }) },
    '@/lib/transaction-permissions': { authorizeTransaction: async (...args) => {
      permissions.push(args.slice(1))
      return permitted ? { ok: true, branchIds: [8] } : { ok: false, response: { status: 403 } }
    } },
    '@/app/api/accounts/_lib': { ensureAccountsTable: async () => {} },
    '@/app/api/receipts/_lib': { ensureTables: async () => {} },
    './_lib': { ...chequeLib, ensureChequeOperationsTable: async () => {} },
  })
  return { ...mod, calls, permissions }
}
const request = query => ({ nextUrl: new URL(`http://localhost/api/cheques?${query}`) })

test('returned cheques retain their stored status in the page and voucher picker at any due date', async () => {
  for (const due_date of ['2026-01-01', '2027-01-01']) {
    for (const has_operations of [false, true]) {
      const api = searchApi({ rows: [{ ...returned, due_date, has_operations }] })
      for (const query of ['type=1', 'picker=cheque_payment']) {
        const response = await api.GET(request(query))
        assert.equal(response.status, 200)
        assert.equal(response.body.rows[0].status_id, 5)
        assert.equal(response.body.rows[0].status_name, 'راجع')
        assert.match(response.headers['Cache-Control'], /no-store/)
      }
    }
  }
})

test('payment picker enforces permission and retains branch, currency, eligibility, and exclusion filters', async () => {
  const denied = searchApi({ permitted: false })
  assert.equal((await denied.GET(request('picker=cheque_payment'))).status, 403)
  assert.equal(denied.calls.length, 0)
  const api = searchApi()
  await api.GET(request('picker=cheque_payment&branch_id=8&currency_id=2&exclude=15,16,15,invalid&type=2&operation_code=repay'))
  assert.deepEqual(api.permissions, [['cheque_payment', 'view', '8']])
  const call = api.calls.find(row => row.query.includes('FROM cheques_tbl c'))
  const boundAfter = suffix => call.values[call.strings.findIndex(part => part.endsWith(suffix))]
  assert.equal(boundAfter('WHERE c.cheq_type='), 1)
  assert.deepEqual(call.values.find(value => Array.isArray(value) && value.includes(5)), [1, 2, 3, 5])
  assert.deepEqual(boundAfter(' OR NOT(c.id=ANY('), [15, 16])
  assert.deepEqual(boundAfter(' OR vh.branch_id=ANY('), [8])
  assert.equal(boundAfter(' OR c.currency_id='), 2)
  assert.match(call.query, /c.current_account_id IS NOT NULL/)
  assert.match(call.query, /COALESCE\(vh.status,1\)<>3/)
})

// A small hook runner exercises the real components' requests, state, and JSX
// without a browser or a dependency on the local company's database.
function hooks() {
  const slots = [], pending = []
  let index = 0
  const react = {
    useState(initial) {
      const slot = index++
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value }]
    },
    useRef(initial) { return react.useState(() => ({ current: initial }))[0] },
    useEffect(fn, dependencies) {
      const slot = index++
      const old = slots[slot]
      if (!old || dependencies.some((value, i) => !Object.is(value, old.dependencies[i]))) {
        old?.cleanup?.()
        const effect = { dependencies }
        slots[slot] = effect
        pending.push(() => { effect.cleanup = fn() })
      }
    },
  }
  return { react, render(Component, props) {
    index = 0
    const tree = Component(props)
    pending.splice(0).forEach(run => run())
    return tree
  }, dispose() { slots.forEach(slot => slot?.cleanup?.()) } }
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [tree]
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('picker fetches the cheque API without cache and renders returned status instead of due-date status', async t => {
  const runner = hooks(), api = searchApi(), requests = []
  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    requests.push({ url, options })
    const response = await api.GET({ nextUrl: new URL(url, 'http://localhost') })
    return { ok: response.status === 200, json: async () => response.body }
  }
  t.after(() => { runner.dispose(); global.fetch = originalFetch })
  const { ChequeSearch } = load('components/accounting/unified-cheque-payment-voucher.tsx', { react: runner.react }, '\nexport { ChequeSearch }')
  const props = { open: true, onOpenChange() {}, currencyId: 2, excluded: [17], onSelect() {} }
  runner.render(ChequeSearch, props)
  await tick()
  const url = new URL(requests[0].url, 'http://localhost')
  assert.equal(url.pathname, '/api/cheques')
  assert.equal(url.searchParams.get('picker'), 'cheque_payment')
  assert.equal(url.searchParams.get('currency_id'), '2')
  assert.equal(url.searchParams.get('exclude'), '17')
  assert.equal(requests[0].options.cache, 'no-store')
  assert.ok(nodes(runner.render(ChequeSearch, props)).includes('راجع'))
  runner.render(ChequeSearch, { ...props, open: false })
  runner.render(ChequeSearch, props)
  await tick()
  assert.equal(requests.length, 2, 'reopening fetches the current status again')
})

test('a late response from an older picker search cannot overwrite the current results', async t => {
  const runner = hooks(), requests = []
  const originalFetch = global.fetch
  global.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }))
  t.after(() => { runner.dispose(); global.fetch = originalFetch })
  const { ChequeSearch } = load('components/accounting/unified-cheque-payment-voucher.tsx', { react: runner.react }, '\nexport { ChequeSearch }')
  const props = { open: true, onOpenChange() {}, currencyId: 2, excluded: [], onSelect() {} }
  const tree = runner.render(ChequeSearch, props)
  nodes(tree).find(node => node?.props?.['aria-label'] === 'بحث').props.onClick()
  assert.equal(requests[0].options.signal.aborted, true)
  requests[1].resolve({ ok: true, json: async () => ({ rows: [returned] }) })
  await tick()
  requests[0].resolve({ ok: true, json: async () => ({ rows: [{ ...returned, status_name: 'مستحق' }] }) })
  await tick()
  const rendered = nodes(runner.render(ChequeSearch, props))
  assert.ok(rendered.includes('راجع'))
  assert.equal(rendered.includes('مستحق'), false)
})

test('history carries voucher type through the API and dialog to the correct screen', async t => {
  const logs = [
    { id: 1, voucher_id: 21, voucher_type: 21, journal_voucher_code: 'Q000000001', operation_date: '2026-09-21' },
    { id: 2, voucher_id: 22, voucher_type: 3, journal_voucher_code: 'J000000001', operation_date: '2026-09-21' },
    { id: 3, voucher_id: 23, journal_voucher_code: 'Q000000002', operation_date: '2026-09-21' },
  ]
  const calls = []
  const api = load('app/api/cheques/operations/route.ts', {
    'next/server': nextServer,
    '@/lib/database': { __esModule: true, default: async strings => {
      const query = strings.join('?'); calls.push(query)
      return query.includes('SELECT l.*') ? logs : [returned]
    } },
    '@/lib/tenant-auth': { getSessionUser: async () => ({ user_id: '7' }) },
    '@/app/api/receipts/_lib': { ensureTables: async () => {} },
    '@/app/api/cheques/_lib': { ...chequeLib, ensureChequeOperationsTable: async () => {} },
  })
  const runner = hooks(), requests = []
  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    requests.push({ url, options })
    const response = await api.GET({ nextUrl: new URL(url, 'http://localhost') })
    assert.match(response.headers['Cache-Control'], /no-store/)
    return { ok: true, json: async () => response.body }
  }
  t.after(() => { runner.dispose(); global.fetch = originalFetch })
  const { DetailsDialog } = load('components/accounting/cheques-management.tsx', { react: runner.react }, '\nexport { DetailsDialog }')
  const props = { cheque: { ...returned, status_name: 'مستحق' }, open: true, onOpenChange() {} }
  runner.render(DetailsDialog, props)
  await tick()
  const rendered = nodes(runner.render(DetailsDialog, props))
  const links = rendered.filter(node => node?.type === 'VoucherLink')
  assert.equal(links.length, 2, 'missing voucher types must not silently default to a journal')
  assert.equal(voucherHref(links[0].props.id, links[0].props.type, '22'), '/?section=cheque-payment-vouchers&voucher_id=21&company=22')
  assert.equal(voucherHref(links[1].props.id, links[1].props.type), '/?section=journal-vouchers&voucher_id=22')
  assert.ok(rendered.includes('سند صرف شيكات'))
  assert.ok(rendered.some(node => node?.props?.label === 'الحالة' && node.props.value === 'راجع'))
  assert.match(calls[0], /vh\.vch_type voucher_type/)
  assert.equal(requests[0].options.cache, 'no-store')
})
