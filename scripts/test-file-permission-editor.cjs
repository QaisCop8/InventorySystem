// Run: node --test scripts/test-file-permission-editor.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

const definitions = load('lib/file-permission-definitions.ts')
const actions = ['access', 'view', 'create', 'update', 'delete']
const permission = (access_id, access_name) => ({ access_id, access_name, category_name: 'ملفات', is_granted: false })
const items = Object.keys(definitions.FILE_FAMILIES).flatMap((family, index) =>
  actions.map((action, offset) => permission(index * 5 + offset + 1, definitions.filePermissionName(family, action))))
const jsx = (type, props) => ({ type, props })

function harness(tab = 'files', filter = 'all') {
  let hookIndex = 0
  const editor = load('components/settings/branch-permission-editor.tsx', {
    react: { useMemo: fn => fn(), useState: initial => [[tab, filter, new Set()][hookIndex++] ?? initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': {},
    '@/components/ui/badge': { Badge: 'badge' },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/input': { Input: 'input' },
    '@/components/ui/switch': { Switch: 'switch' },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '@/lib/file-permission-definitions': definitions,
  })
  return { ...editor, render: props => {
    hookIndex = 0
    return editor.BranchPermissionEditor({ items, values: {}, onChange: () => {}, search: '', onSearchChange: () => {}, ...props })
  } }
}

function nodes(node, result = []) {
  if (!node || typeof node !== 'object') return result
  if (typeof node.type === 'function') return nodes(node.type(node.props), result)
  result.push(node)
  for (const child of [node.props?.children].flat(Infinity)) nodes(child, result)
  return result
}

test('classifies all file families before general permissions and groups legacy aliases without duplicating IDs', () => {
  const editor = harness()
  const legacy = [permission(101, 'اضافة العملاء'), permission(102, 'ادخال العملاء'), permission(103, 'الدخول لشاشه العملاء')]
  const voucher = permission(200, 'إدخال فاتورة مبيعات')
  const general = permission(300, 'إدارة المستخدمين')
  const result = editor.classify([...items, ...legacy, legacy[0], voucher, general])
  assert.equal(result.fileRows.size, 13)
  assert.equal(result.fileRows.get('customers').cells.create.length, 3)
  assert.equal(result.fileRows.get('customers').cells.access.length, 2)
  assert.equal(result.rows.get('فاتورة مبيعات').cells.create[0], voucher)
  assert.deepEqual([...result.others.values()].flat(), [general])
})

test('granting create enables access and all create aliases while leaving query independent', () => {
  const editor = harness()
  const row = editor.classify([...items, permission(101, 'اضافة العملاء')]).fileRows.get('customers')
  const original = { 2: false, 60: true }
  const next = editor.setFilePermissionValues([row], original, 'create', true)
  assert.equal(next[1], true)
  assert.equal(next[3], true)
  assert.equal(next[101], true)
  assert.equal(next[2], false)
  assert.equal(next[60], true)
  assert.deepEqual(original, { 2: false, 60: true })
})

test('removing access revokes every action, but removing query preserves access and create', () => {
  const editor = harness()
  const row = editor.classify(items).fileRows.get('customers')
  const granted = editor.setFilePermissionValues([row], { 6: true }, 'all', true)
  const withoutQuery = editor.setFilePermissionValues([row], granted, 'view', false)
  assert.equal(withoutQuery[1], true)
  assert.equal(withoutQuery[2], false)
  assert.equal(withoutQuery[3], true)
  const withoutAccess = editor.setFilePermissionValues([row], granted, 'access', false)
  for (const id of [1, 2, 3, 4, 5]) assert.equal(withoutAccess[id], false)
  assert.equal(withoutAccess[6], true)
})

test('file tab renders all thirteen families and sixty-five action buttons', () => {
  const rendered = nodes(harness().render())
  assert.equal(rendered.filter(node => node.type === 'th' && node.props.scope === 'row').length, 13)
  assert.equal(rendered.filter(node => node.type === 'button' && node.props['aria-pressed'] !== undefined && !String(node.props['aria-label']).includes('لكل ملفات')).length, 65)
  assert.equal(rendered.filter(node => node.type === 'switch').length, 13)
})

test('column toggles grant create and entry for its group without granting query or unrelated files', () => {
  let next
  const rendered = nodes(harness().render({ onChange: values => { next = values } }))
  const column = rendered.find(node => node.type === 'button' && node.props['aria-label'] === 'تفعيل إضافة لكل ملفات الأشخاص والجهات')
  assert.ok(column)
  column.props.onClick()
  for (const offset of [0, 5, 10, 15]) {
    assert.equal(next[offset + 1], true)
    assert.equal(next[offset + 3], true)
    assert.equal(next[offset + 2], undefined)
  }
  assert.equal(next[21], undefined)
})

test('search and granted filter limit visible bulk toggles to matching file rows', () => {
  for (const [search, filter, values] of [['العملاء', 'all', {}], ['', 'granted', { 1: true, 3: true }]]) {
    let next
    const rendered = nodes(harness('files', filter).render({ search, values, onChange: value => { next = value } }))
    assert.equal(rendered.filter(node => node.type === 'th' && node.props.scope === 'row').length, 1)
    const visible = rendered.find(node => node.type === 'button' && [node.props.children].flat(Infinity).includes('تفعيل الظاهر'))
    assert.ok(visible)
    visible.props.onClick()
    for (const id of [1, 2, 3, 4, 5]) assert.equal(next[id], true)
    assert.equal(next[6], undefined)
  }
})

test('transaction create still enables transaction query', () => {
  let next
  const rendered = nodes(harness('vouchers').render({
    items: [permission(201, 'استعلام فاتورة مبيعات'), permission(202, 'إدخال فاتورة مبيعات')],
    onChange: values => { next = values },
  }))
  const create = rendered.find(node => node.type === 'button' && node.props['aria-label'] === 'إدخال فاتورة مبيعات')
  create.props.onClick()
  assert.deepEqual(next, { 201: true, 202: true })
})
