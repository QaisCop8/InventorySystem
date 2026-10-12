const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { AsyncLocalStorage } = require('node:async_hooks')

function load(file, dependencies = {}, globals = {}) {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, mod, mod.exports, ...Object.values(globals))
  return mod.exports
}

const users = load('lib/pos-point-users.ts')
const { validatePosAccounts } = load('lib/pos-account-validation.ts')

const pointForm = {
  name: 'POS', branch_id: 1, main_warehouse_id: 1, currency_id: 2,
  sales_book_id: 3, price_category_id: 1, users: [],
}

function pointRequest(method, body, search = '') {
  const request = new Request(`http://localhost/api/pos/points${search}`, {
    method, ...(body ? { body: JSON.stringify(body) } : {}),
  })
  request.nextUrl = new URL(request.url)
  return request
}

// Model the transaction-scoped database lock so concurrent requests exercise
// the actual allocation order instead of being serialized by the test itself.
function pointRoute({ points = [], userId = 7, allowed = true, licenseError } = {}) {
  const calls = [], permissions = [], licenseCalls = []
  const records = points.map(point => ({ branch_id: 1, status: 1, ...point }))
  const transaction = new AsyncLocalStorage()
  let lockTail = Promise.resolve(), transactionId = 0
  const sql = async (parts, ...values) => {
    const query = parts.join('?').replace(/\s+/g, ' ').trim()
    const context = transaction.getStore()
    calls.push({ query, values, transactionId: context?.id, locked: Boolean(context?.release) })
    if (query.includes('pg_advisory_xact_lock')) {
      assert.ok(context, 'allocation lock must run inside the tenant transaction')
      const previous = lockTail
      lockTail = new Promise(resolve => { context.release = resolve })
      await previous
      return []
    }
    if (query.includes('AS last_number')) {
      const matching = records.filter(point => /^P[0-9]{9}$/i.test(point.code)
        && (!query.includes('status') || point.status !== 3))
      const lastNumber = Math.max(0, ...matching.map(point => Number(point.code.slice(1))))
      await new Promise(resolve => setImmediate(resolve))
      return [{ last_number: String(lastNumber) }]
    }
    if (query.startsWith('SELECT branch_id FROM pos_points_tbl')) {
      return records.filter(point => point.id === values[0] && point.status !== 3)
    }
    if (query.startsWith('SELECT id FROM')) return [{ id: values[0] }]
    if (query.startsWith('INSERT INTO pos_points_tbl')) {
      const columns = query.match(/pos_points_tbl\(([^)]+)\)/)[1].split(',').map(column => column.trim())
      const record = { id: 90 + records.length, ...Object.fromEntries(columns.map((column, index) => [column, values[index]])), status: 1 }
      if (records.some(point => point.code.toUpperCase() === record.code.toUpperCase())) throw new Error('Duplicate POS code')
      records.push(record)
      return [record]
    }
    if (query.startsWith('UPDATE pos_points_tbl SET')) {
      const record = records.find(point => point.id === values.at(-1))
      if (!record) return []
      const assignments = [...query.matchAll(/([a-z_]+)=\?/g)].map(match => match[1])
      for (let index = 0; index < assignments.length - 1; index++) record[assignments[index]] = values[index]
      return [record]
    }
    return []
  }
  const withTenantTransaction = fn => transaction.run({ id: ++transactionId }, async () => {
    try { return await fn() } finally { transaction.getStore().release?.() }
  })
  const route = load('app/api/pos/points/route.ts', {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@/lib/database': { __esModule: true, default: sql, withTenantTransaction },
    '@/app/api/sales-vouchers/_lib': { ensureTables: async () => {} },
    '../_lib': {
      ensurePosTables: async () => {}, requestUserId: () => userId, requestBranchId: () => null,
      canUsePosCashierPermission: async (...args) => { permissions.push(args); return allowed },
    },
    '@/lib/pos-point-users': users,
    '@/lib/company-license': {
      assertLicenseAllows: async (...args) => { licenseCalls.push(args); if (licenseError) throw licenseError },
      licenseErrorResponseBody: error => error === licenseError ? { error: 'POS point limit reached' } : null,
    },
  })
  return { route, records, calls, permissions, licenseCalls }
}

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
  const { route, calls } = pointRoute()
  const form = { ...pointForm,
    users: [{ user_id: 7 }, { user_id: '7' }, { user_id: 8 }], cash_account_id: '', walk_in_account_id: '', card_account_id: null, cheque_account_id: '', tax_account_id: '', return_account_id: '', gift_account_id: '' }
  const save = data => route.POST(pointRequest('POST', data))
  assert.equal((await save(form)).status, 201)
  const insert = calls.find(call => call.query.startsWith('INSERT INTO pos_points_tbl'))
  const columns = insert.query.match(/pos_points_tbl\(([^)]+)\)/)[1].split(',')
  const values = Object.fromEntries(columns.map((column, index) => [column, insert.values[index]]))
  for (const field of ['cash_account_id', 'walk_in_account_id', 'card_account_id', 'cheque_account_id', 'tax_account_id', 'return_account_id', 'gift_account_id']) assert.equal(values[field], null)
  assert.deepEqual(calls.filter(call => call.query.startsWith('INSERT INTO pos_point_users_tbl')).map(call => call.values[1]), ['7', '8'])
  calls.length = 0
  assert.equal((await save({ ...form, cash_account_id: '123', walk_in_account_id: '124', users: [] })).status, 201)
  const saved = calls.find(call => call.query.startsWith('INSERT INTO pos_points_tbl'))
  assert.equal(saved.values[columns.indexOf('cash_account_id')], 123)
  assert.equal(saved.values[columns.indexOf('walk_in_account_id')], 124)
  assert.equal(calls.some(call => call.query.startsWith('INSERT INTO pos_point_users_tbl')), false)
})

test('POS creation generates codes without a client code and ignores a supplied code', async () => {
  const { route, permissions, licenseCalls } = pointRoute()
  const first = await route.POST(pointRequest('POST', pointForm))
  assert.equal(first.status, 201)
  assert.equal((await first.json()).code, 'P000000001')
  const second = await route.POST(pointRequest('POST', { ...pointForm, code: 'CUSTOM-CODE' }))
  assert.equal(second.status, 201)
  assert.equal((await second.json()).code, 'P000000002')
  assert.deepEqual(permissions, [[7, 1, 'createPoint'], [7, 1, 'createPoint']])
  assert.deepEqual(licenseCalls, [['pos_points'], ['pos_points']])
})

test('POS next-code preview reserves deleted codes and ignores legacy or malformed codes', async () => {
  const { route, records, calls } = pointRoute({ points: [
    { id: 1, code: 'P000000003' }, { id: 2, code: 'p000000017', status: 3 },
    { id: 3, code: 'CUSTOM-999' }, { id: 4, code: 'P9999999999' },
  ] })
  const preview = await route.GET(pointRequest('GET', undefined, '?next-code=1'))
  assert.equal(preview.status, 200)
  assert.deepEqual(await preview.json(), { code: 'P000000018' })
  assert.equal(records.length, 4, 'preview must not create a point')
  assert.equal(calls.some(call => /INSERT|UPDATE/.test(call.query)), false)
  const saved = await route.POST(pointRequest('POST', pointForm))
  assert.equal(saved.status, 201)
  assert.equal((await saved.json()).code, 'P000000018')
})

test('simultaneous POS creations allocate separate codes under the transaction lock', async () => {
  const { route, calls } = pointRoute()
  const responses = await Promise.all([
    route.POST(pointRequest('POST', { ...pointForm, code: 'SAME' })),
    route.POST(pointRequest('POST', { ...pointForm, code: 'SAME' })),
  ])
  assert.deepEqual(responses.map(response => response.status), [201, 201])
  const saved = await Promise.all(responses.map(response => response.json()))
  assert.deepEqual(saved.map(point => point.code).sort(), ['P000000001', 'P000000002'])
  assert.equal(calls.filter(call => call.query.includes('pg_advisory_xact_lock')).length, 2)
  for (const call of calls.filter(call => call.query.includes('AS last_number') || call.query.startsWith('INSERT INTO pos_points_tbl'))) {
    assert.ok(call.transactionId && call.locked, 'sequence selection and insert must hold the transaction lock')
  }
})

test('POS updates preserve the stored code even if a different code is submitted', async () => {
  const { route, records } = pointRoute({ points: [{ id: 12, code: 'LEGACY-12' }] })
  for (const code of ['REPLACEMENT', undefined]) {
    const response = await route.PUT(pointRequest('PUT', { ...pointForm, id: 12, code, name: 'Updated POS' }))
    assert.equal(response.status, 200)
    const saved = await response.json()
    assert.equal(saved.code, 'LEGACY-12')
    assert.equal(saved.name, 'Updated POS')
    assert.equal(records[0].code, 'LEGACY-12')
  }
})

test('POS creation still enforces authentication, permissions and the license limit', async () => {
  for (const [options, status] of [[{ userId: null }, 401], [{ allowed: false }, 403], [{ licenseError: new Error('Limit') }, 409]]) {
    const { route, records } = pointRoute(options)
    const response = await route.POST(pointRequest('POST', pointForm))
    assert.equal(response.status, status)
    assert.equal(records.length, 0)
  }
  const { route } = pointRoute({ userId: null })
  assert.equal((await route.GET(pointRequest('GET', undefined, '?next-code=1'))).status, 401)
})

class FocusField {
  constructor(tagName = 'BUTTON', options = {}) {
    Object.assign(this, { tagName, tabIndex: 0, visible: true, focused: 0, selected: 0, role: null }, options)
  }
  focus() { this.focused++ }
  select() { this.selected++ }
  getClientRects() { return this.visible ? [{}] : [] }
  getAttribute(name) { return this[name] ?? null }
  closest() { return this.accountField ? {} : null }
}
class InputField extends FocusField {
  constructor(options) { super('INPUT', { type: 'text', value: '', ...options }) }
}

function renderPointDialog() {
  const jsx = (type, props) => ({ type, props })
  const components = names => Object.fromEntries(names.split(' ').map(name => [name, name]))
  const component = load('components/pos/pos-points-settings.tsx', {
    react: {
      useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }),
      useEffect() {}, useCallback: callback => callback,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': components('BadgeDollarSign Building2 CreditCard Edit3 Package Plus RefreshCw Save Store Trash2 Users X'),
    '@/components/ui/button': components('Button'),
    '@/components/ui/dialog': components('Dialog DialogContent DialogDescription DialogFooter DialogHeader DialogTitle'),
    '@/components/ui/input': components('Input'), '@/components/ui/label': components('Label'),
    '@/components/ui/switch': components('Switch'),
    '@/components/customer/auto-complete-account': () => null,
    '@/lib/pos-point-users': users, './pos-dialog-messages': components('PosDialogMessages'),
    '@/components/settings/license-limit': {
      LicenseUsageStrip: 'LicenseUsageStrip', useCompanyLicense: () => ({ license: null, reload() {} }),
      useLicenseRequestDialog: () => ({ element: null, open() {}, handleLimit: () => false }),
    },
  }, { HTMLInputElement: InputField })
  const nodes = []
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node?.props) return
    nodes.push(node)
    visit(node.props.children)
  }
  visit(component.default())
  return { dialog: nodes.find(node => node.type === 'DialogContent').props, inputs: nodes.filter(node => node.type === 'Input') }
}

function keyEvent(target, fields, overrides = {}) {
  return {
    key: 'Enter', nativeEvent: {}, defaultPrevented: false, stopped: false, target,
    currentTarget: { contains: element => fields.includes(element), querySelectorAll: () => fields },
    preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true },
    ...overrides,
  }
}

test('POS dialog keeps its generated code readonly and focuses the name when opened', () => {
  const { dialog, inputs } = renderPointDialog()
  const code = inputs.find(input => input.props.readOnly)
  assert.ok(code)
  assert.equal(code.props.tabIndex, -1)
  assert.equal(code.props.onChange, undefined)
  const name = inputs.find(input => input.props.ref)
  const nameField = new InputField()
  name.props.ref.current = nameField
  let prevented = false
  dialog.onOpenAutoFocus({ preventDefault() { prevented = true } })
  assert.ok(prevented)
  assert.equal(nameField.focused, 1)
  assert.equal(nameField.selected, 1)
})

test('POS dialog Enter advances through inputs, native selects, checkboxes and switches to Save', () => {
  const { dialog } = renderPointDialog()
  const name = new InputField(), hidden = new InputField({ visible: false })
  const warehouse = new FocusField('SELECT'), checkbox = new InputField({ type: 'checkbox' })
  const toggle = new FocusField('BUTTON', { role: 'switch' }), save = new FocusField()
  const fields = [name, hidden, warehouse, checkbox, toggle, save]
  for (const [current, next] of [[name, warehouse], [warehouse, checkbox], [checkbox, toggle], [toggle, save]]) {
    const event = keyEvent(current, fields)
    dialog.onKeyDown(event)
    assert.ok(event.defaultPrevented)
    assert.ok(event.stopped)
    assert.equal(next.focused, 1)
  }
  assert.equal(hidden.focused, 0)
  assert.equal(checkbox.selected, 0)
  const saveEvent = keyEvent(save, fields)
  dialog.onKeyDown(saveEvent)
  assert.equal(saveEvent.defaultPrevented, false, 'Enter on Save must retain its normal action')
})

test('POS dialog preserves handled lookup keys, composition, modifier keys and portal events', () => {
  const { dialog } = renderPointDialog()
  const current = new InputField(), next = new InputField(), fields = [current, next]
  for (const override of [
    { key: 'Tab' }, { defaultPrevented: true }, { nativeEvent: { isComposing: true } },
    { shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true },
    { target: new InputField() },
  ]) dialog.onKeyDown(keyEvent(current, fields, override))
  assert.equal(next.focused, 0)
  const event = keyEvent(current, fields)
  dialog.onKeyDown(event)
  assert.equal(next.focused, 1)
  assert.equal(next.selected, 1)
})

test('POS dialog can skip an empty optional account while typed accounts keep their lookup action', () => {
  const { dialog } = renderPointDialog()
  const account = new InputField({ accountField: true }), next = new InputField()
  const fields = [account, next]
  const empty = keyEvent(account, fields)
  dialog.onKeyDownCapture(empty)
  assert.ok(empty.defaultPrevented)
  assert.equal(next.focused, 1)
  account.value = '123'
  const typed = keyEvent(account, fields)
  dialog.onKeyDownCapture(typed)
  assert.equal(typed.defaultPrevented, false)
  assert.equal(next.focused, 1)
})

test('cashier validates cash-card account and requires a customer for cheque or credit', () => {
  assert.equal(validatePosAccounts({ cash_account_id: 10 }, [{ method: 'cash', amount: 20 }, { method: 'card', amount: 0 }], { mode: 'sale' }), null)
  for (const [method, label] of [['cash', 'الصندوق'], ['card', 'البطاقات'], ['cheque', 'الشيكات'], ['gift_card', 'الهدايا']]) {
    const issue = validatePosAccounts({}, [{ method, amount: 20 }], { mode: 'sale' })
    assert.ok(issue.includes(label))
    assert.match(issue, /تعريف نقطة البيع.*للمستخدم.*النظام/)
  }
  assert.match(validatePosAccounts({}, [{ method: 'account', amount: 20 }], { mode: 'sale' }), /اختيار العميل/)
  assert.match(validatePosAccounts({ cash_account_id: 10, card_account_id: 11 }, [{ method: 'cash', amount: 10 }, { method: 'card', amount: 10 }], { mode: 'sale' }), /الحساب النقدي/)
  assert.equal(validatePosAccounts({ cash_account_id: 10, card_account_id: 11, walk_in_account_id: 12 }, [{ method: 'cash', amount: 10 }, { method: 'card', amount: 10 }], { mode: 'sale' }), null)
  assert.match(validatePosAccounts({ cash_account_id: 10, cheque_account_id: 12 }, [{ method: 'cash', amount: 10 }, { method: 'cheque', amount: 10 }, { method: 'account', amount: 10 }], { mode: 'sale' }), /اختيار العميل/)
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
