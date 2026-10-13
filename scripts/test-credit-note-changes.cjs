// Run: node --test scripts/test-credit-note-changes.cjs
// Execute the actual change snapshots and component handlers with isolated state.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const parent = 'components/accounting/credit-note.tsx'
const child = 'components/accounting/unified-credit-note.tsx'
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

const snapshotExports = {}
new Function('exports', compile(fs.readFileSync('lib/credit-note-changes.ts', 'utf8')))(snapshotExports)
const { creditNoteSnapshot } = snapshotExports

function handler(file, name, env) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let initializer
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(initializer, `Missing handler ${name} in ${file}`)
  return new Function('env', `with(env) { ${compile(`const subject = ${initializer}`)}; return subject }`)(env)
}

function fixture() {
  return {
    id: 12, status: 1, is_printed: 0, vch_type: 6, vch_code: 'CN0001',
    vch_date: '2026-10-13', manual_date: '2026-10-13', manual_voucher: '', note: '',
    vch_book_id: 1, branch_id: 2, currency_id: 1, rate: 1,
    account_id: 10, customer_name: 'Customer', debit_account_id: 20, vat_account_id: 30,
    amount_journal_type_8: 100, vat_percent: 16, vat: 16, amount: 116,
    salesman_id: null, payment_classification_id: null,
    account_cost_centers: [], debit_account_cost_centers: [], vat_account_cost_centers: [],
  }
}

function editor() {
  const initial = fixture()
  const env = {
    formRef: { current: structuredClone(initial) }, cleanFormRef: { current: structuredClone(initial) },
    cleanSnapshotRef: { current: creditNoteSnapshot(initial) },
    copiedVoucherRef: { current: false }, bookChangeRequestRef: { current: 0 }, pendingBookChangeRef: { current: null },
    setFormState() {}, creditNoteSnapshot,
  }
  for (const name of ['editForm', 'setForm', 'hasUnsavedChanges', 'handleFormChange']) env[name] = handler(parent, name, env)
  return env
}

function actions({ dirty = true, saving = false, loading = false } = {}) {
  const state = { prompt: false, actions: 0, saves: 0, postDialog: true }
  const form = fixture()
  const env = {
    form, latestFormRef: { current: form }, isSaving: saving, isLoading: loading, navLoading: loading,
    saveInFlightRef: { current: false }, pendingActionRef: { current: null },
    codeEditedRef: { current: false }, codeRequestRef: { current: 0 }, codeAtFocusRef: { current: form.vch_code },
    showUnsavedConfirm: false, hasUnsavedChanges: () => dirty,
    setShowUnsavedConfirm(value) { state.prompt = value; env.showUnsavedConfirm = value },
    setPostDialogOpen(value) { state.postDialog = value },
    onSave: async () => { state.saves++; return true },
  }
  for (const name of ['guardedAction', 'cancelPendingAction', 'discardAndContinue', 'saveAndContinue', 'handleCodeBlur']) {
    env[name] = handler(child, name, env)
  }
  return { env, state, action: () => { state.actions++ } }
}

test('credit-note snapshots normalize API numeric strings, empty optional values and lookup labels', () => {
  const saved = fixture()
  const displayed = structuredClone(saved)
  for (const key of ['vch_type', 'vch_book_id', 'branch_id', 'currency_id', 'rate', 'account_id', 'debit_account_id', 'vat_account_id', 'amount_journal_type_8', 'vat_percent', 'vat', 'amount']) {
    displayed[key] = String(displayed[key])
  }
  Object.assign(displayed, {
    salesman_id: 0, payment_classification_id: '', customer_name: 'Resolved customer name',
    account_code: 'A00010', account_name: 'Resolved customer', debit_account_name: 'Discount', vat_account_name: 'VAT',
    vch_date: `${saved.vch_date}T00:00:00.000Z`, manual_date: `${saved.manual_date}T00:00:00.000Z`,
    status: 2, is_printed: 1, insert_user: 4, updated_at: '2026-10-14',
  })
  assert.equal(creditNoteSnapshot(displayed), creditNoteSnapshot(saved))
  assert.equal(creditNoteSnapshot({ ...saved, vat: null, vat_percent: 0 }), creditNoteSnapshot({ ...saved, vat: '0', vat_percent: null }))
})

test('snapshots ignore insignificant VAT calculation drift while preserving meaningful amount and identifier changes', () => {
  const saved = { ...fixture(), amount_journal_type_8: 10, vat: 1.8, amount: 11.8, vat_percent: 18 }
  const calculated = { ...saved, amount_journal_type_8: 10.000000000000002, vat: 1.799999999999999 }
  assert.equal(creditNoteSnapshot(calculated), creditNoteSnapshot(saved))
  assert.notEqual(creditNoteSnapshot({ ...saved, vat: 1.80000001 }), creditNoteSnapshot(saved))
  assert.notEqual(creditNoteSnapshot({ ...saved, vat_account_id: 1000000000000001 }), creditNoteSnapshot({ ...saved, vat_account_id: 1000000000000002 }))
})

test('cost-center ordering, names and API string IDs do not mark a credit note dirty', () => {
  const saved = fixture()
  for (const key of ['account_cost_centers', 'debit_account_cost_centers', 'vat_account_cost_centers']) {
    saved[key] = [
      { cost_center_type_id: 1, cost_center_id: 11, cost_center_name: 'First' },
      { cost_center_type_id: 2, cost_center_id: 22, cost_center_name: 'Second' },
    ]
  }
  const displayed = structuredClone(saved)
  for (const key of ['account_cost_centers', 'debit_account_cost_centers', 'vat_account_cost_centers']) {
    displayed[key] = displayed[key].reverse().map(row => ({
      cost_center_type_id: String(row.cost_center_type_id), cost_center_id: String(row.cost_center_id), cost_center_name: 'Resolved label',
    }))
  }
  assert.equal(creditNoteSnapshot(displayed), creditNoteSnapshot(saved))
})

test('all editable credit-note header and amount fields are detected, including the code and VAT', () => {
  const saved = fixture()
  const changes = [
    { vch_type: 7 }, { vch_code: 'CN0002' }, { vch_book_id: 3 }, { branch_id: 3 }, { currency_id: 2 }, { rate: 2 },
    { vch_date: '2026-10-14' }, { manual_date: '2026-10-14' }, { manual_voucher: 'Paper 4' }, { note: 'Changed' },
    { account_id: 11 }, { debit_account_id: 21 }, { vat_account_id: 31 }, { salesman_id: 1 }, { payment_classification_id: 1 },
    { amount_journal_type_8: 101 }, { vat_percent: 17 }, { vat: 17 }, { amount: 117 },
  ]
  for (const patch of changes) {
    assert.notEqual(creditNoteSnapshot({ ...saved, ...patch }), creditNoteSnapshot(saved), Object.keys(patch)[0])
  }
  for (const key of ['account_cost_centers', 'debit_account_cost_centers', 'vat_account_cost_centers']) {
    assert.notEqual(creditNoteSnapshot({ ...saved, [key]: [{ cost_center_type_id: 1, cost_center_id: 11 }] }), creditNoteSnapshot(saved), key)
  }
})

test('editing and reverting preserve the clean baseline; a code change cannot reset other changes', () => {
  const env = editor()
  const baseline = env.cleanSnapshotRef.current
  env.editForm(form => ({ ...form, note: 'Unsaved', vch_code: 'CN0002' }))
  assert.equal(env.hasUnsavedChanges(), true)
  assert.equal(env.cleanSnapshotRef.current, baseline)
  env.editForm(form => ({ ...form, vch_code: 'CN0001' }))
  assert.equal(env.hasUnsavedChanges(), true)
  env.editForm(fixture())
  assert.equal(env.hasUnsavedChanges(), false)
})

test('loading/new/successful-save transitions establish a clean baseline and invalidate pending book requests', () => {
  const env = editor()
  env.editForm(form => ({ ...form, note: 'Saved change' }))
  env.copiedVoucherRef.current = true
  env.pendingBookChangeRef.current = Promise.resolve()
  const request = env.bookChangeRequestRef.current
  env.setForm({ ...env.formRef.current, id: 99 })
  assert.equal(env.hasUnsavedChanges(), false)
  assert.equal(env.copiedVoucherRef.current, false)
  assert.equal(env.pendingBookChangeRef.current, null)
  assert.ok(env.bookChangeRequestRef.current > request)
  env.setForm({ ...fixture(), id: 0, vch_code: 'CN0003' })
  assert.equal(env.hasUnsavedChanges(), false)
  env.editForm(form => ({ ...form, vat: 20 }))
  assert.equal(env.hasUnsavedChanges(), true)
})

test('an unchanged copy remains unsaved until its own save or new/load transition', () => {
  const env = editor()
  env.copiedVoucherRef.current = true
  assert.equal(env.hasUnsavedChanges(), true)
  env.setForm(fixture())
  assert.equal(env.hasUnsavedChanges(), false)
})

test('automatic initial branch selection stays clean without hiding edits made while it loads', () => {
  for (const note of ['', 'Edited before branches loaded']) {
    const env = editor()
    env.setForm({ ...fixture(), id: 0, branch_id: null })
    if (note) env.handleFormChange('note', note)
    env.handleFormChange('branch_id', 2)
    assert.equal(env.formRef.current.branch_id, 2)
    assert.equal(env.cleanFormRef.current.branch_id, 2)
    assert.equal(env.formRef.current.note, note)
    assert.equal(env.hasUnsavedChanges(), Boolean(note))
    env.handleFormChange('branch_id', 3)
    assert.equal(env.hasUnsavedChanges(), true)
  }
})

for (const keepSavedVoucher of [false, true]) test(`parent save waits for book generation and ${keepSavedVoucher ? 'keeps the saved record for close/navigation' : 'starts a clean new voucher'}`, async () => {
  const env = editor()
  const requests = [], errors = []
  let resolveBook
  env.editForm({ ...fixture(), id: 0, vch_code: '', vch_book_id: null })
  Object.assign(env, {
    saveInFlightRef: { current: false }, pendingBookChangeRef: { current: new Promise(resolve => { resolveBook = resolve }) },
    user: { id: 4 }, voucherType: 6, currencies: [], labels: { title: 'Credit note' },
    validateVoucher: data => data.vch_code && data.vch_book_id ? null : 'Missing voucher number',
    setIsSaving() {}, setIsNewMode() {}, setDialogOpen() {}, setPrintData() {},
    setErrorMessages: value => errors.push(value),
    normalizeVoucher: value => value,
    fetch: async (_url, request) => {
      const payload = JSON.parse(request.body)
      requests.push(payload)
      return { ok: true, json: async () => ({ ...payload, id: 99 }) }
    },
    fetchVouchers: async () => {}, fetchDefaults: async () => ({ bookId: 1, currencyId: 1 }),
    fetchAccountDefaults: async () => ({ vatAccountId: 30, debitAccountId: 20 }),
    generateCode: async () => 'CN0003', buildInitialForm: () => ({ ...fixture(), id: 0, note: '' }),
  })
  const saving = handler(parent, 'saveVoucher', env)('save', keepSavedVoucher)
  await Promise.resolve()
  assert.equal(requests.length, 0)
  env.editForm(form => ({ ...form, vch_book_id: 3, vch_code: 'CN0002', note: 'Latest edit' }))
  resolveBook()
  assert.equal(await saving, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].vch_book_id, 3)
  assert.equal(requests[0].vch_code, 'CN0002')
  assert.equal(requests[0].note, 'Latest edit')
  assert.ok(errors.every(value => value.length === 0))
  assert.equal(env.hasUnsavedChanges(), false)
  assert.equal(env.formRef.current.id, keepSavedVoucher ? 99 : 0)
  assert.equal(env.formRef.current.vch_code, keepSavedVoucher ? 'CN0002' : 'CN0003')
  assert.equal(env.saveInFlightRef.current, false)
})

for (const failure of ['validation', 'server']) test(`a parent ${failure} failure keeps the credit note dirty and never establishes a new baseline`, async () => {
  const env = editor()
  const errors = []
  let requests = 0
  env.editForm(form => ({ ...form, note: 'Keep this edit' }))
  const baseline = env.cleanSnapshotRef.current
  Object.assign(env, {
    saveInFlightRef: { current: false }, user: { id: 4 },
    validateVoucher: () => failure === 'validation' ? 'Missing VAT account' : null,
    setIsSaving() {}, setErrorMessages: value => errors.push(value),
    fetch: async () => { requests++; return { ok: false, json: async () => ({ error: 'Server rejected voucher' }) } },
  })
  assert.equal(await handler(parent, 'saveVoucher', env)('save', true), false)
  assert.equal(requests, failure === 'server' ? 1 : 0)
  assert.equal(env.cleanSnapshotRef.current, baseline)
  assert.equal(env.formRef.current.note, 'Keep this edit')
  assert.equal(env.hasUnsavedChanges(), true)
  assert.equal(env.saveInFlightRef.current, false)
  assert.ok(errors.some(value => value.length > 0))
})

for (const name of ['openNewDialog', 'openEditDialog', 'handleCodeResolved']) {
  for (const interruption of ['close', 'newer record']) test(`${name} ignores its asynchronous response after ${interruption}`, async () => {
    const env = editor()
    const state = { open: true, openings: [], index: 0 }
    let resolveRequest
    const response = new Promise(resolve => { resolveRequest = resolve })
    Object.assign(env, {
      voucherType: 6, vouchers: [fixture()], showDeleteConfirm: false,
      normalizeVoucher: value => value, buildInitialForm: () => ({ ...fixture(), id: 0 }),
      fetchDefaults: () => response,
      fetchAccountDefaults: async () => ({ vatAccountId: 30, debitAccountId: 20 }),
      generateCode: async () => 'CN0099', fetchVoucherDetails: () => response,
      setDialogOpen(value) { state.open = value; state.openings.push(value) },
      setCurrentIndex(value) { state.index = value }, setIsNewMode() {}, setErrorMessages() {}, setShowDeleteConfirm() {},
    })
    const run = handler(parent, name, env)
    const pending = name === 'openNewDialog' ? run() : name === 'openEditDialog' ? run({ ...fixture(), id: 99 }, 3) : run(99)
    if (interruption === 'close') handler(parent, 'handleDialogOpenChange', env)(false)
    else handler(parent, 'handleNavigateRecord', env)({ ...fixture(), id: 44, vch_code: 'CN0044', note: 'Newer record' })
    const before = structuredClone({ form: env.formRef.current, state, baseline: env.cleanSnapshotRef.current })
    resolveRequest(name === 'openNewDialog' ? { bookId: 1, currencyId: 1 } : { ...fixture(), id: 99, vch_code: 'CN0099' })
    assert.equal(await pending, undefined)
    assert.deepEqual(env.formRef.current, before.form)
    assert.deepEqual(state, before.state)
    assert.equal(env.cleanSnapshotRef.current, before.baseline)
    assert.equal(state.open, interruption !== 'close')
  })
}

test('untouched or reverted amount fields do not recalculate rounded saved values when blurred', () => {
  const form = { ...fixture(), amount_journal_type_8: 10, vat: 1.8, amount: 11.8, vat_percent: 18 }
  for (const field of ['amount', 'amount_journal_type_8', 'vat']) {
    for (const focused of [false, true]) {
      const updates = []
      const env = {
        form: structuredClone(form), calculationValuesRef: { current: focused ? { [field]: form[field] } : {} },
        onFormChange: (key, value) => updates.push([key, value]),
      }
      if (focused) {
        // Typing and reverting before blur is equivalent to leaving the input unchanged.
        env.form[field] += 1
        env.form[field] = form[field]
      }
      handler(child, 'doCalculation', env)(field)
      assert.deepEqual(updates, [], field)
      assert.equal(creditNoteSnapshot(env.form), creditNoteSnapshot(form))
      assert.equal(field in env.calculationValuesRef.current, false)
    }
  }
})

test('editing an amount field recalculates the related amounts once using the edited value', () => {
  const cases = [
    { field: 'amount', from: 11.8, to: 23.6, expected: { amount_journal_type_8: 20, vat: 3.6 } },
    { field: 'amount_journal_type_8', from: 10, to: 20, expected: { amount: 23.6, vat: 3.6 } },
    { field: 'vat', from: 1.8, to: 3.6, expected: { amount: 23.6, amount_journal_type_8: 20 } },
  ]
  for (const { field, from, to, expected } of cases) {
    const updates = []
    const env = {
      form: { ...fixture(), amount_journal_type_8: 10, vat: 1.8, amount: 11.8, vat_percent: 18, [field]: to },
      calculationValuesRef: { current: { [field]: from } },
      onFormChange: (key, value) => updates.push([key, value]),
    }
    const calculate = handler(child, 'doCalculation', env)
    calculate(field)
    assert.equal(updates.length, 2, field)
    for (const [key, value] of updates) assert.ok(Math.abs(value - expected[key]) < 1e-10, `${field} -> ${key}: ${value}`)
    assert.equal(field in env.calculationValuesRef.current, false)
    calculate(field)
    assert.equal(updates.length, 2, `${field} repeated blur recalculated again`)
  }
})

test('editing then restoring the total restores the clean snapshot despite reciprocal VAT rounding', () => {
  const initial = { ...fixture(), amount_journal_type_8: 10, vat: 1.8, amount: 11.8, vat_percent: 18 }
  const env = {
    form: structuredClone(initial), calculationValuesRef: { current: {} },
    onFormChange(key, value) { env.form[key] = value },
  }
  const calculate = handler(child, 'doCalculation', env)
  env.calculationValuesRef.current.amount = env.form.amount
  env.form.amount = 23.6
  calculate('amount')
  assert.notEqual(creditNoteSnapshot(env.form), creditNoteSnapshot(initial))
  env.calculationValuesRef.current.amount = env.form.amount
  env.form.amount = initial.amount
  calculate('amount')
  assert.equal(creditNoteSnapshot(env.form), creditNoteSnapshot(initial))
})

test('a changed VAT percentage still recalculates the total breakdown; an unchanged percentage does not', () => {
  for (const changed of [false, true]) {
    const updates = []
    const env = {
      form: { ...fixture(), amount_journal_type_8: 10, vat: 1.8, amount: 11.8, vat_percent: changed ? 20 : 18 },
      calculationValuesRef: { current: { vat_percent: 18 } },
      onFormChange: (key, value) => updates.push([key, value]),
    }
    handler(child, 'doCalculation', env)('amount', 'vat_percent')
    assert.equal(updates.length, changed ? 2 : 0)
    if (changed) {
      const breakdown = Object.fromEntries(updates)
      assert.ok(Math.abs(breakdown.amount_journal_type_8 - 11.8 / 1.2) < 1e-10)
      assert.ok(Math.abs(breakdown.vat - (11.8 - 11.8 / 1.2)) < 1e-10)
    }
    assert.equal('vat_percent' in env.calculationValuesRef.current, false)
  }
})

test('clean voucher closes immediately; a dirty voucher waits for a decision', () => {
  for (const dirty of [false, true]) {
    const h = actions({ dirty })
    h.env.guardedAction(h.action)
    assert.equal(h.state.actions, dirty ? 0 : 1)
    assert.equal(h.state.prompt, dirty)
  }
})

test('discard executes once even after repeated close requests and preserves the first requested action', () => {
  const h = actions()
  h.env.guardedAction(h.action)
  h.env.guardedAction(() => assert.fail('second close replaced the first'))
  h.env.discardAndContinue()
  h.env.discardAndContinue()
  assert.equal(h.state.actions, 1)
  assert.equal(h.state.prompt, false)
  assert.equal(h.env.pendingActionRef.current, null)
})

test('back/dismiss keeps edits and clears the pending close action', () => {
  const h = actions()
  h.env.guardedAction(h.action)
  h.env.cancelPendingAction()
  h.env.discardAndContinue()
  assert.equal(h.state.actions, 0)
  assert.equal(h.state.prompt, false)
  assert.equal(h.env.pendingActionRef.current, null)
  assert.deepEqual(h.env.latestFormRef.current, fixture())
  assert.equal(h.env.hasUnsavedChanges(), true)
})

for (const saved of [true, false]) test(`save-and-continue ${saved ? 'resumes close once after success' : 'stays on the voucher after failure'}`, async () => {
  const h = actions()
  let resolveSave
  h.env.onSave = (action, keepSavedVoucher) => {
    h.state.saves++
    assert.equal(action, 'save')
    assert.equal(keepSavedVoucher, true)
    return new Promise(resolve => { resolveSave = resolve })
  }
  h.env.guardedAction(h.action)
  const saving = h.env.saveAndContinue()
  await h.env.saveAndContinue()
  assert.equal(h.state.saves, 1)
  assert.equal(h.state.actions, 0)
  resolveSave(saved)
  await saving
  assert.equal(h.state.actions, saved ? 1 : 0)
  assert.equal(h.env.pendingActionRef.current, null)
  assert.equal(h.env.saveInFlightRef.current, false)
  assert.equal(h.env.hasUnsavedChanges(), true)
})

test('save/close actions cannot interrupt an ongoing save', async () => {
  const h = actions({ saving: true })
  h.env.guardedAction(h.action)
  await h.env.saveAndContinue()
  assert.equal(h.state.actions, 0)
  assert.equal(h.state.saves, 0)
  assert.equal(h.state.prompt, false)
})

test('blurring an untouched generated voucher number does not resolve or clear the voucher', async () => {
  const h = actions()
  h.env.fetch = () => assert.fail('untouched voucher code must not trigger a lookup')
  await h.env.handleCodeBlur()
})

test('a code lookup started before close cannot reopen or replace the voucher after close is requested', async () => {
  const h = actions()
  let resolveLookup, resolves = 0, replacements = 0
  Object.assign(h.env, {
    fetch: () => new Promise(resolve => { resolveLookup = resolve }),
    messagesRef: { current: { show() {} } },
    onFormChange: () => { replacements++ },
    onCodeResolved: () => { resolves++ }, onCodeNotFound: () => { resolves++ },
  })
  h.env.codeEditedRef.current = true
  h.env.latestFormRef.current = { ...fixture(), vch_code: 'CN0099' }
  h.env.form = h.env.latestFormRef.current
  const lookup = h.env.handleCodeBlur()
  assert.equal(typeof resolveLookup, 'function')
  h.env.guardedAction(h.action)
  h.env.discardAndContinue()
  resolveLookup({ ok: true, json: async () => ({ code: 'CN0099', exists: true, id: 99 }) })
  await lookup
  assert.equal(h.state.actions, 1)
  assert.equal(resolves, 0)
  assert.equal(replacements, 0)
  assert.equal(h.state.prompt, false)
})

for (const closeBeforeValidation of [false, true]) test(`pending save validation ${closeBeforeValidation ? 'cannot reopen its popup after close' : 'opens the save picker when the request remains current'}`, async () => {
  const h = actions({ dirty: false })
  let resolveValidation
  Object.assign(h.env, {
    isLocked: false,
    onValidateSave: () => new Promise(resolve => { resolveValidation = resolve }),
    messagesRef: { current: { clear() {}, show() {} } },
  })
  h.state.postDialog = false
  const validating = handler(child, 'handleRequestSave', h.env)()
  await Promise.resolve()
  assert.equal(h.state.postDialog, false)
  if (closeBeforeValidation) h.env.guardedAction(h.action)
  resolveValidation(null)
  await validating
  assert.equal(h.state.postDialog, !closeBeforeValidation)
  assert.equal(h.state.actions, closeBeforeValidation ? 1 : 0)
})

function renderEditor({ unsaved = false, deleting = false, posting = false, dirty = false } = {}) {
  const sourceText = fs.readFileSync(child, 'utf8')
  const source = ts.createSourceFile(child, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const dependencies = {}, stateNames = [], states = { showUnsavedConfirm: unsaved, postDialogOpen: posting }
  const closed = []
  let stateIndex = 0
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const imports = {}
    if (statement.importClause.name) imports.default = statement.importClause.name.text
    const bindings = statement.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) imports[(element.propertyName || element.name).text] = element.name.text
    }
    dependencies[statement.moduleSpecifier.text] = imports
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) &&
      node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'useState') {
      stateNames.push(node.name.elements[0].name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  dependencies.react = {
    useEffect() {}, useMemo: factory => factory(), useRef: current => ({ current }),
    useState: initial => {
      const name = stateNames[stateIndex++]
      if (!(name in states)) states[name] = initial
      return [states[name], value => { states[name] = value }]
    },
  }
  const jsx = (type, props) => ({ type, props })
  dependencies['react/jsx-runtime'] = { jsx, jsxs: jsx, Fragment: 'Fragment' }
  dependencies['@/contexts/workspace-context'].useWorkspace = () => ({ fullscreenEnabled: false })
  dependencies['@/contexts/workspace-tab-context'].useWorkspaceTabActive = () => ({ current: true })
  dependencies['@/lib/navigation-guard'].useNavigationGuard = () => {}
  dependencies['@/hooks/use-toast'].useToast = () => ({ toast() {} })
  const compiled = ts.transpileModule(sourceText, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'exports', 'module', compiled)(name => {
    assert.ok(name in dependencies, `Unexpected child dependency ${name}`)
    return dependencies[name]
  }, mod.exports, mod)
  const tree = mod.exports.default({
    title: 'Credit note', dialogOpen: true, currentIndex: 0, totalRecords: 1, form: fixture(), isSaving: false,
    showDeleteConfirm: deleting, hasUnsavedChanges: () => dirty,
    onSave: async () => true, onFormChange() {}, onOpenChange: value => closed.push(value),
  })
  const nodes = []
  function collect(node) {
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    for (const item of [node.props?.children].flat(Infinity)) collect(item)
  }
  collect(tree)
  return { nodes, states, closed }
}

test('credit-note confirmations share the app dialog and release the parent modal while open', () => {
  for (const state of [{}, { unsaved: true }, { deleting: true }, { posting: true }]) {
    const h = renderEditor(state)
    const confirmations = h.nodes.filter(node => node.type === 'ConfirmDialogYesNo')
    assert.equal(confirmations.length, 2)
    assert.ok(confirmations.every(node => node.props.useAppDialog === true))
    const dialog = h.nodes.find(node => node.type === 'Dialog')
    assert.equal(dialog.props.modal, Object.values(state).some(Boolean) ? false : undefined)
    const unsaved = confirmations.find(node => node.props.showBack)
    assert.equal(unsaved.props.onBack, unsaved.props.onDismiss)
    assert.notEqual(unsaved.props.onCancel, unsaved.props.onDismiss)
  }
})

test('both the X button and dialog close request close a clean credit note and permit discard on a dirty one', () => {
  for (const dirty of [false, true]) {
    for (const closeVia of ['x', 'dialog']) {
      const h = renderEditor({ dirty })
      if (closeVia === 'x') h.nodes.find(node => node.type === 'button' && node.props['aria-label'] === 'إغلاق').props.onClick()
      else h.nodes.find(node => node.type === 'Dialog').props.onOpenChange(false)
      assert.deepEqual(h.closed, dirty ? [] : [false])
      assert.equal(h.states.showUnsavedConfirm, dirty)
      if (dirty) {
        h.nodes.find(node => node.type === 'ConfirmDialogYesNo' && node.props.showBack).props.onCancel()
        assert.deepEqual(h.closed, [false])
        assert.equal(h.states.showUnsavedConfirm, false)
      }
    }
  }
})
