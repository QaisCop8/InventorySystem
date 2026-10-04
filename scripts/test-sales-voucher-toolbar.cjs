const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const parent = 'components/sales/sales-delivery.tsx'
const child = 'components/sales/unified-sales-delivery.tsx'

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
}
const exportsObject = {}
new Function('exports', compile(fs.readFileSync('lib/sales-voucher-changes.ts', 'utf8')))(exportsObject)
const { salesVoucherSnapshot } = exportsObject

// Execute the actual component handlers with controlled state/network dependencies.
function handler(file, name, env) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let initializer
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(initializer, name)
  return new Function('env', `with(env) { ${compile(`const subject = ${initializer}`)}; return subject }`)(env)
}
function fixture() {
  return { id: 12, status: 1, vch_type: 15, vch_book_id: 1, vch_code: 'T0001', rate: 1, cash_account_id: 5,
    items: [{ product_id: 1, quantity: 2, unit_price: 10, unit_id: 1, account_id: 5 }] }
}
function editor() {
  const initial = fixture()
  const env = {
    formRef: { current: structuredClone(initial) }, cleanFormRef: { current: structuredClone(initial) },
    copiedVoucherRef: { current: false }, bookChangeRequestRef: { current: 0 }, pendingBookChangeRef: { current: null },
    setFormState() {}, salesVoucherSnapshot,
  }
  for (const name of ['editForm', 'setForm', 'hasUnsavedChanges', 'handleBookChange']) env[name] = handler(parent, name, env)
  return env
}

test('grid formatting and numeric conversion do not mark a saved voucher dirty', () => {
  const saved = fixture()
  const rendered = structuredClone(saved)
  Object.assign(rendered.items[0], { quantity: '2', unit_price: '10', ser: 1, unit_name: 'unit', total_price: 20, line_amount: 20, unit_price_incl_tax: 21.6, current_stock: 200 })
  rendered.items.push({ product_id: null, quantity: 0, ser: 2 })
  assert.equal(salesVoucherSnapshot(rendered), salesVoucherSnapshot(saved))
})

test('editable voucher and row changes are detected and reverting them is clean', () => {
  const env = editor()
  for (const patch of [{ vch_book_id: 3 }, { note: 'changed' }, { cash_account_id: 6 }, { currency_id: 2 }]) {
    env.editForm({ ...fixture(), ...patch })
    assert.equal(env.hasUnsavedChanges(), true)
    env.editForm(fixture())
    assert.equal(env.hasUnsavedChanges(), false)
  }
  for (const patch of [{ quantity: 3 }, { unit_price: 11 }, { discount_percent: 10 }, { warehouse_id: 2 }, { selected_attributes: { size: 'L' } }, { serial_numbers: ['123'] }]) {
    env.editForm({ ...fixture(), items: [{ ...fixture().items[0], ...patch }] })
    assert.equal(env.hasUnsavedChanges(), true)
  }
})

test('copy/change book/save/new establishes a clean baseline without losing edits', async () => {
  const env = editor()
  env.copiedVoucherRef.current = true
  env.editForm({ ...fixture(), id: 0 })
  env.generateCode = async book => `${book === 3 ? 'C' : 'A'}0001`
  await env.handleBookChange(3)
  assert.equal(env.formRef.current.vch_book_id, 3)
  assert.equal(env.formRef.current.vch_code, 'C0001')
  assert.equal(env.hasUnsavedChanges(), true)
  env.setForm({ ...env.formRef.current, id: 99 })
  assert.equal(env.hasUnsavedChanges(), false)
  env.setForm({ ...fixture(), id: 0, vch_code: 'C0002', items: [] })
  assert.equal(env.hasUnsavedChanges(), false)
})

test('stale book number responses cannot overwrite a newer selection or loaded voucher', async () => {
  const env = editor()
  env.editForm({ ...fixture(), id: 0 })
  const replies = {}
  env.generateCode = book => new Promise(resolve => { replies[book] = resolve })
  const first = env.handleBookChange(2)
  const second = env.handleBookChange(3)
  replies[3]('C0001'); await second
  replies[2]('A0001'); await first
  assert.equal(env.formRef.current.vch_code, 'C0001')
  const pending = env.handleBookChange(2)
  env.setForm(fixture())
  replies[2]('A0002'); await pending
  assert.equal(env.formRef.current.vch_code, 'T0001')
  assert.equal(env.hasUnsavedChanges(), false)
})

for (const keepSavedVoucher of [false, true]) test(`save waits for the book number and ${keepSavedVoucher ? 'retains the saved record for continuation' : 'starts a clean new voucher'}`, async () => {
  const env = editor()
  env.editForm({ ...fixture(), id: 0, vch_book_id: null, vch_code: '' })
  let resolveNumber
  env.generateCode = () => new Promise(resolve => { resolveNumber = resolve })
  const changing = env.handleBookChange(2)
  const payloads = []
  Object.assign(env, {
    validateVoucher: data => data.vch_code && data.vch_book_id ? null : 'missing book',
    setIsSaving() {}, setErrorMessages(errors) { assert.deepEqual(errors, []) },
    fetch: async (_url, request) => { const data = JSON.parse(request.body); payloads.push(data); return { ok: true, json: async () => ({ ...data, id: 99 }) } },
    normalizeVoucher: data => data, fetchVouchers: async () => {}, fetchDefaults: async () => ({ bookId: 1, currencyId: 1 }),
    buildInitialForm: () => ({ ...fixture(), id: 0, items: [] }), setGridResetToken() {}, setDialogOpen() {},
  })
  const saving = handler(parent, 'saveVoucherInternal', env)('save', keepSavedVoucher)
  await Promise.resolve()
  assert.equal(payloads.length, 0)
  resolveNumber('A0001'); await changing
  env.generateCode = async () => 'A0002'
  assert.equal(await saving, true)
  assert.equal(payloads[0].vch_code, 'A0001')
  assert.equal(payloads[0].vch_book_id, 2)
  assert.equal(payloads[0].items.length, 1)
  assert.equal(env.hasUnsavedChanges(), false)
  assert.equal(env.formRef.current.id, keepSavedVoucher ? 99 : 0)
})

test('New/navigation commits an active grid edit before deciding whether to prompt', () => {
  const env = editor()
  let prompted = false, navigated = false
  Object.assign(env, {
    form: fixture(), isSaving: false, isLoading: false, showUnsavedConfirm: false,
    saveInFlightRef: { current: false }, pendingActionRef: { current: null }, itemsRef: { current: fixture().items },
    commitGridItemsBeforeSave() { env.itemsRef.current[0].unit_price = 25 },
    setShowUnsavedConfirm(value) { prompted = value },
  })
  handler(child, 'guardedAction', env)(() => { navigated = true })
  assert.equal(prompted, true)
  assert.equal(navigated, false)
  assert.equal(typeof env.pendingActionRef.current, 'function')
})

test('blurring a generated/copied voucher number does not reload or clear its items', async () => {
  const env = { codeEditedRef: { current: false }, fetch() { assert.fail('unchanged code must not trigger lookup') } }
  await handler(child, 'handleCodeBlur', env)()
})

for (const saved of [true, false]) test(`save-and-continue ${saved ? 'resumes once on success' : 'stays on errors'}`, async () => {
  let committed = 0, continued = 0, closed = 0, requests = 0, resolveSave
  const env = {
    saveInFlightRef: { current: false }, isSaving: false, isLoading: false,
    commitGridItemsBeforeSave() { committed++ },
    onSave: () => { requests++; return new Promise(resolve => { resolveSave = resolve }) },
    setPostDialogOpen(value) { if (!value) closed++ },
    pendingActionRef: { current: () => { continued++ } },
  }
  const save = handler(child, 'saveAndContinue', env)
  const first = save('save')
  await save('save')
  assert.equal(requests, 1)
  resolveSave(saved); await first
  assert.equal(committed, 1)
  assert.equal(continued, saved ? 1 : 0)
  assert.equal(closed, 1)
  assert.equal(env.saveInFlightRef.current, false)
})

test('all shared toolbar styles disable every action while saving and respect navigation boundaries', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  let style = 'modern'
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync('components/ui/universal-toolbar.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const mockRequire = name => {
    if (name === '@/contexts/theme-context') return { useThemeSettings: () => ({ settings: { toolbar_style: style } }) }
    if (name === '@/components/ui/button') return { Button: ({ variant, ...props }) => React.createElement('button', props) }
    if (name === '@/components/ui/dropdown-menu' || name.endsWith('.css')) return {}
    return require(name)
  }
  new Function('require', 'exports', 'module', code)(mockRequire, mod.exports, mod)
  const labels = Object.fromEntries('new save previous next first last delete report exportExcel print clone'.split(' ').map(key => [key, key]))
  const props = { labels, totalRecords: 3, currentRecord: 1, ...Object.fromEntries('New Save First Previous Next Last Delete Report ExportExcel Print Clone'.split(' ').map(key => [`on${key}`, () => {}])) }
  const buttons = extra => renderToStaticMarkup(React.createElement(mod.exports.UniversalToolbar, { ...props, ...extra })).match(/<button\b[^>]*>/g)
  for (style of ['modern', 'gradient', 'compact', 'classic']) {
    for (const busy of [{ isSaving: true }, { isLoading: true }]) {
      const rendered = buttons(busy)
      assert.equal(rendered.length, 11)
      assert.ok(rendered.every(button => button.includes('disabled=""')), style)
    }
    const first = buttons({ isFirstRecord: true })
    assert.ok(first.find(button => button.includes('aria-label="previous"')).includes('disabled=""'))
    assert.ok(!first.find(button => button.includes('aria-label="next"')).includes('disabled=""'))
    assert.ok(buttons({ isFirstRecord: true, isNewRecord: true }).find(button => button.includes('aria-label="previous"')).indexOf('disabled=""') < 0)
  }
})
