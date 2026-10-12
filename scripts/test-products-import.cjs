const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const response = { json: (body, init = {}) => ({ body, status: init.status || 200 }) }
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function load(file, dependencies, fetch) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'module', 'exports', 'fetch', code)(name => {
    if (name === 'next/server') return { NextResponse: response }
    if (!(name in dependencies)) throw new Error(`Unexpected dependency in ${file}: ${name}`)
    return dependencies[name]
  }, module, module.exports, fetch)
  return module.exports
}

// Render the exported dialog far enough to use the real wizard configuration.
// No browser or component implementation is needed to exercise its import work.
async function openImport({ lookups = {}, lookupFailures = [], onLookupPost } = {}) {
  const requests = [], saved = [], reports = []
  const initial = {
    '/api/product-categories': [],
    '/api/warehouses': [],
    '/api/units': [{ id: 31, unit_code: 'PCS', unit_name: 'Piece', unit_name_en: 'Each' }],
    '/api/item-groups': [{ id: 52, group_code: 'DRINKS', group_name: 'Drinks' }],
    '/api/pricecategory': [{ id: 83, name: 'Retail', name_en: 'Retail price' }],
    ...lookups,
  }
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    requests.push({ url, method, body })
    if (method === 'GET' && url in initial) {
      if (lookupFailures.includes(url)) return json({ error: 'Lookup unavailable' }, 500)
      return json(initial[url])
    }
    if (url === '/api/settings/system') return json({})
    if (url === '/api/inventory/products' && method === 'POST') {
      saved.push(body)
      return json({ id: 1000 + saved.length }, 201)
    }
    if (method === 'POST' && onLookupPost) return onLookupPost(url, body)
    throw new Error(`Unexpected import request: ${method} ${url}`)
  }
  const slots = [], effects = []
  let index = 0
  const react = {
    useState(initialValue) {
      const slot = index++
      if (!(slot in slots)) slots[slot] = initialValue
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value }]
    },
    useEffect(effect, deps) {
      const slot = index++
      if (!slots[slot] || deps.some((value, i) => value !== slots[slot][i])) effects.push(effect)
      slots[slot] = deps
    },
    useMemo: factory => factory(),
  }
  const wizard = load('components/import/excel-import-wizard.tsx', {
    react: {}, 'lucide-react': {}, '@/components/ui/button': {}, '@/components/ui/input': {},
    '@/components/ui/dialog': {}, '@/contexts/workspace-dialog-context': {}, '@/components/common/Messages': {},
    'react/jsx-runtime': {},
  })
  const component = load('components/import/products-import.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/components/import/excel-import-wizard': { ...wizard, ExcelImportWizard: () => null },
  }, fetch)
  const render = () => {
    index = 0
    return component.ProductsImportDialog({ open: true, onOpenChange() {} })
  }
  render()
  for (const effect of effects.splice(0)) effect()
  await new Promise(resolve => setImmediate(resolve))
  const rendered = render()
  assert.ok(rendered?.props?.config, 'the lookup load should produce an import wizard configuration')
  return {
    config: rendered.props.config, requests, saved, reports,
    async run(data) {
      const rows = data.map((values, i) => ({ id: i + 1, rowNumber: i + 2, data: { product_code: String(i + 1), product_name: `Product ${i + 1}`, unit_1: 'Piece', ...values } }))
      await rendered.props.config.importRows(rows, undefined, (id, result) => reports.push({ id, ...result }), new AbortController().signal)
      return reports
    },
  }
}

const lookupPosts = context => context.requests.filter(request => request.method === 'POST' && request.url !== '/api/inventory/products')
const assertSavedLookupIds = (product, unit, group, price) => {
  assert.equal(product.units[0].unit_id, unit)
  assert.equal(product.main_stock_id, group)
  assert.equal(product.prices[0].price_category_id, price)
  assert.equal(product.prices[0].unit_id, unit)
}

test('Excel import reuses existing names, codes and IDs and the actual first price category ID', async () => {
  const context = await openImport()
  const category = context.config.fields.find(field => field.key === 'price_category')
  assert.ok(category, 'price categories should be available for Excel column mapping')
  assert.ok(!category.required, 'price category is optional')
  assert.ok(!category.options?.length, 'new category names must pass through the wizard as free text')
  await context.run([
    { unit_1: ' piece ', main_stock_group: ' drinks ', price_category: ' retail ', unit_1_sale_price: 4.5 },
    { unit_1: 'PCS', main_stock_group: 'DRINKS', price_category: '83', unit_1_sale_price: 5 },
    { unit_1: '31', main_stock_group: '52', unit_1_sale_price: 6 },
    { unit_1: 'each', main_stock_group: 'Drinks', price_category: 'Retail price', unit_1_sale_price: 7 },
  ])
  assert.deepEqual(context.reports, [1, 2, 3, 4].map(id => ({ id, ok: true })))
  assert.equal(lookupPosts(context).length, 0)
  context.saved.forEach(product => assertSavedLookupIds(product, 31, 52, 83))
})

test('Excel import creates missing lookup rows once and caches their returned names and codes', async () => {
  const context = await openImport({
    onLookupPost: (url, body) => {
      assert.equal(body.reuse_existing, true)
      if (url === '/api/units') return json({ id: 71, unit_name: 'Crate', unit_code: 'CRT' }, 201)
      if (url === '/api/item-groups') return json({ id: 72, group_name: 'Hot Drinks', group_code: 'G000000072' }, 201)
      if (url === '/api/pricecategory') return json({ id: 73, name: 'Wholesale', name_en: 'Bulk' }, 201)
      throw new Error(`Unexpected lookup POST: ${url}`)
    },
  })
  await context.run([
    { unit_1: 'Crate', main_stock_group: 'Hot Drinks', price_category: 'Wholesale', unit_1_sale_price: 9 },
    { unit_1: ' crate ', main_stock_group: ' hot drinks ', price_category: ' wholesale ', unit_1_sale_price: 10 },
    { unit_1: 'CRT', main_stock_group: 'G000000072', price_category: 'Bulk', unit_1_sale_price: 11 },
  ])
  assert.deepEqual(context.reports, [1, 2, 3].map(id => ({ id, ok: true })))
  assert.deepEqual(lookupPosts(context).map(request => request.url).sort(), ['/api/item-groups', '/api/pricecategory', '/api/units'])
  context.saved.forEach(product => assertSavedLookupIds(product, 71, 72, 73))
})

test('Excel import keeps distinct definition names distinct when their internal spaces differ', async () => {
  const context = await openImport({
    lookups: {
      '/api/units': [{ id: 31, unit_name: 'A B' }],
      '/api/item-groups': [{ id: 52, group_name: 'A B', group_code: 'OLDGROUP' }],
      '/api/pricecategory': [{ id: 83, name: 'A B' }],
    },
    onLookupPost: url => {
      if (url === '/api/units') return json({ id: 71, unit_name: 'AB' }, 201)
      if (url === '/api/item-groups') return json({ id: 72, group_name: 'AB' }, 201)
      if (url === '/api/pricecategory') return json({ id: 73, name: 'AB' }, 201)
      throw new Error(`Unexpected lookup POST: ${url}`)
    },
  })
  await context.run([{ unit_1: 'AB', main_stock_group: 'AB', price_category: 'AB', unit_1_sale_price: 5 }])
  assert.deepEqual(context.reports, [{ id: 1, ok: true }])
  assert.equal(lookupPosts(context).length, 3)
  assertSavedLookupIds(context.saved[0], 71, 72, 73)
})

test('Excel import resolves colliding lookup aliases by name, English name, code and ID regardless of list order', async () => {
  const lookups = {
    '/api/units': [
      { id: 1, unit_name: 'Other', unit_name_en: 'Chosen', unit_code: '500' },
      { id: 2, unit_name: 'Other 2', unit_name_en: 'English', unit_code: 'Chosen' },
      { id: 4, unit_name: 'Chosen', unit_code: 'English' },
      { id: 8, unit_name: 'Chosen', unit_code: 'Eight' },
      { id: 500, unit_name: 'Unit ID collision' },
      { id: 9, unit_name: '700' },
      { id: 700, unit_name: 'Other numeric unit' },
    ],
    '/api/item-groups': [
      { id: 1, group_name: 'Other', group_code: 'Chosen' },
      { id: 6, group_name: 'Chosen', group_code: '500' },
      { id: 10, group_name: 'Chosen', group_code: 'Other code' },
      { id: 500, group_name: 'Group ID collision' },
      { id: 9, group_name: '700' },
      { id: 700, group_name: 'Other numeric group' },
    ],
    '/api/pricecategory': [
      { id: 1, name: 'Other', name_en: 'Chosen' },
      { id: 2, name: 'Other 2', name_en: 'English' },
      { id: 8, name: 'Chosen', name_en: '500' },
      { id: 12, name: 'Chosen' },
      { id: 500, name: 'Price ID collision' },
      { id: 9, name: '700' },
      { id: 700, name: 'Other numeric price' },
    ],
  }
  for (const reverse of [false, true]) {
    const context = await openImport({ lookups: Object.fromEntries(Object.entries(lookups).map(([url, rows]) => [url, reverse ? [...rows].reverse() : rows])) })
    await context.run([
      { unit_1: 'Chosen', main_stock_group: 'Chosen', price_category: 'Chosen', unit_1_sale_price: 5 },
      { unit_1: '500', main_stock_group: '500', price_category: '500', unit_1_sale_price: 5 },
      { unit_1: 'English', main_stock_group: 'Chosen', price_category: 'English', unit_1_sale_price: 5 },
      { unit_1: '700', main_stock_group: '700', price_category: '700', unit_1_sale_price: 5 },
    ])
    assert.deepEqual(context.reports, [1, 2, 3, 4].map(id => ({ id, ok: true })))
    assert.equal(lookupPosts(context).length, 0)
    ;[[4, 6, 8], [1, 6, 8], [2, 6, 2], [9, 9, 9]].forEach((ids, index) => assertSavedLookupIds(context.saved[index], ...ids))
  }
})

test('Excel import creates a real default price category when no category exists', async () => {
  const context = await openImport({
    lookups: { '/api/pricecategory': [] },
    onLookupPost: (url, body) => {
      assert.equal(url, '/api/pricecategory')
      assert.equal(body.name, 'سعر البيع')
      assert.equal(body.reuse_existing, true)
      return json({ id: 97, name: body.name }, 201)
    },
  })
  await context.run([{ unit_1_sale_price: 3 }, { unit_1_sale_price: 4 }])
  assert.deepEqual(context.reports, [{ id: 1, ok: true }, { id: 2, ok: true }])
  assert.equal(lookupPosts(context).length, 1)
  assert.deepEqual(context.saved.map(product => product.prices[0].price_category_id), [97, 97])
})

test('Excel import recovers existing IDs with get-or-create when initial lookup lists fail or are stale', async () => {
  const context = await openImport({
    lookups: { '/api/item-groups': [] },
    lookupFailures: ['/api/units', '/api/pricecategory'],
    onLookupPost: (url, body) => {
      assert.equal(body.reuse_existing, true)
      if (url === '/api/units') return json({ id: 31, unit_name: 'Piece', unit_code: 'PCS' })
      if (url === '/api/item-groups') return json({ id: 52, group_name: 'Drinks', group_code: 'DRINKS' })
      if (url === '/api/pricecategory') return json({ id: 83, name: 'Retail' })
      throw new Error(`Unexpected lookup POST: ${url}`)
    },
  })
  await context.run([
    { main_stock_group: 'Drinks', price_category: 'Retail', unit_1_sale_price: 5 },
    { main_stock_group: 'Drinks', price_category: 'Retail', unit_1_sale_price: 6 },
  ])
  assert.deepEqual(context.reports, [{ id: 1, ok: true }, { id: 2, ok: true }])
  assert.equal(lookupPosts(context).length, 3)
  context.saved.forEach(product => assertSavedLookupIds(product, 31, 52, 83))
})

for (const [field, value, url] of [
  ['unit_1', 'New unit', '/api/units'],
  ['main_stock_group', 'المشروبات', '/api/item-groups'],
  ['price_category', 'New category', '/api/pricecategory'],
]) {
  test(`Excel import preserves the actual ${field} creation error in the row report`, async () => {
    const message = `تعذر حفظ التعريف: ${value}`
    const context = await openImport({
      onLookupPost: requestedUrl => {
        assert.equal(requestedUrl, url)
        return json({ error: message }, 500)
      },
    })
    await context.run([{ [field]: value, unit_1_sale_price: 5 }])
    assert.deepEqual(context.reports, [{ id: 1, ok: false, message }])
    assert.deepEqual(context.saved, [])
  })
}

test('Excel import does not create price categories for items without positive sale prices', async () => {
  const context = await openImport({ lookups: { '/api/pricecategory': [] } })
  await context.run([{ unit_1_sale_price: 0 }])
  assert.deepEqual(context.reports, [{ id: 1, ok: true }])
  assert.deepEqual(context.saved[0].prices, [])
  assert.equal(lookupPosts(context).length, 0)
})

const apiCases = [
  {
    label: 'unit', file: 'app/api/units/route.ts', table: 'units', field: 'unit_name',
    row: { id: 31, unit_code: 'PCS', unit_name: 'Piece', unit_name_en: 'Each', status: 1 },
  },
  {
    label: 'item group', file: 'app/api/item-groups/route.ts', table: 'item_groups', field: 'group_name',
    row: { id: 52, group_code: 'DRINKS', group_name: 'Drinks', status: 1 },
  },
  {
    label: 'price category', file: 'app/api/pricecategory/route.ts', table: 'pricecategory', field: 'name',
    row: { id: 83, name: 'Retail', name_en: 'Retail price', status: 1 },
  },
]

function loadApi(spec, execute) {
  const queries = [], transactions = []
  const sql = async (strings, ...values) => {
    const query = strings.join('?').replace(/\s+/g, ' ').trim()
    queries.push({ query, values })
    return execute(query, values)
  }
  const database = {
    __esModule: true, default: sql,
    withTenantTransaction: async callback => {
      transactions.push('begin')
      try {
        const result = await callback(sql)
        transactions.push('commit')
        return result
      } catch (error) {
        transactions.push('rollback')
        throw error
      }
    },
  }
  const api = load(spec.file, {
    '@/lib/database': database,
    '../../../lib/database': database,
    '@/lib/number-generator': { generateItemGroupNumber: async () => 'G000000079' },
  })
  return { api, queries, transactions }
}

for (const spec of apiCases) {
  test(`${spec.label} POST returns the existing row for an Excel get-or-create request`, async () => {
    const context = loadApi(spec, query => {
      if (query.startsWith('SELECT') && query.includes(`FROM ${spec.table}`)) return [spec.row]
      if (query.startsWith('INSERT')) assert.fail('an existing lookup must not be inserted again')
      return []
    })
    const result = await context.api.POST({ json: async () => ({ [spec.field]: ` ${spec.row[spec.field]} `, reuse_existing: true }) })
    assert.equal(result.status, 200)
    assert.equal(result.body.id, spec.row.id)
    assert.equal(result.body[spec.field], spec.row[spec.field])
    const lookup = context.queries.find(({ query }) => query.startsWith('SELECT') && query.includes(`FROM ${spec.table}`))
    assert.ok(lookup, 'the ID should come from the tenant database')
    assert.ok(lookup.values.flat().includes(spec.row[spec.field].toLowerCase()), 'lookup names should be trimmed and case insensitive')
  })

  test(`${spec.label} POST still rejects duplicates without the explicit Excel reuse flag`, async () => {
    for (const reuse_existing of [undefined, false, 'true']) {
      const context = loadApi(spec, query => {
        if (query.startsWith('SELECT') && query.includes(`FROM ${spec.table}`)) return [spec.row]
        if (query.startsWith('INSERT')) assert.fail('duplicate creation must not insert')
        return []
      })
      const result = await context.api.POST({ json: async () => ({ [spec.field]: spec.row[spec.field], reuse_existing }) })
      assert.ok(result.status >= 400 && result.status < 500)
      assert.ok(result.body.error)
    }
  })

  test(`${spec.label} get-or-create resolves alternate existing identifiers`, async () => {
    const identifiers = [['id', String(spec.row.id)]]
    if (spec.row.unit_code) identifiers.push(['unit_code', spec.row.unit_code])
    if (spec.row.group_code) identifiers.push(['group_code', spec.row.group_code])
    if (spec.row.unit_name_en) identifiers.push(['unit_name_en', spec.row.unit_name_en])
    if (spec.row.name_en) identifiers.push(['name_en', spec.row.name_en])
    for (const [column, identifier] of identifiers) {
      const context = loadApi(spec, (query, values) => {
        if (query.startsWith('SELECT') && query.includes(`FROM ${spec.table}`)) {
          const where = query.split(' WHERE ')[1]?.split(' ORDER BY ')[0] || ''
          const bindsIdentifier = values.flat().some(value => String(value).toLowerCase() === identifier.toLowerCase())
          return new RegExp(`\\b${column}\\b`).test(where) && bindsIdentifier ? [spec.row] : []
        }
        if (query.startsWith('INSERT')) assert.fail(`existing ${column} should be resolved before inserting`)
        return []
      })
      const result = await context.api.POST({ json: async () => ({ [spec.field]: identifier, reuse_existing: true }) })
      assert.equal(result.status, 200, `${column} ${identifier} should identify the existing ${spec.label}`)
      assert.equal(result.body.id, spec.row.id)
    }
  })

  test(`${spec.label} POST recovers the existing ID after a competing insert`, async () => {
    let insertAttempts = 0
    const context = loadApi(spec, query => {
      if (query.startsWith('SELECT nextval')) return [{ id: 79 }]
      if (query.startsWith('SELECT') && query.includes(`FROM ${spec.table}`)) return insertAttempts ? [spec.row] : []
      if (query.startsWith('INSERT')) {
        insertAttempts++
        throw Object.assign(new Error('duplicate key violates unique constraint'), { code: '23505' })
      }
      return []
    })
    const result = await context.api.POST({ json: async () => ({ [spec.field]: spec.row[spec.field], reuse_existing: true }) })
    assert.equal(result.status, 200)
    assert.equal(result.body.id, spec.row.id)
    assert.equal(insertAttempts, 1)
    assert.deepEqual(context.transactions, ['begin', 'rollback'])
  })

  test(`${spec.label} POST creates a missing definition and returns the new ID`, async () => {
    let inserted
    const name = spec.label === 'item group' ? 'المشروبات' : `New ${spec.label}`
    const context = loadApi(spec, (query, values) => {
      if (query.startsWith('SELECT nextval')) return [{ id: 79 }]
      if (query.startsWith('INSERT')) {
        const columns = query.match(/INSERT INTO \w+\s*\(([^)]+)\)/)?.[1].split(',').map(column => column.trim())
        assert.ok(columns, 'create should supply explicit columns')
        inserted = { id: 79, ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) }
        return [inserted]
      }
      return []
    })
    const result = await context.api.POST({ json: async () => ({
      [spec.field]: ` ${name} `,
      unit_name_en: 'English unit name',
      ...(spec.label === 'item group' ? { group_code: name } : {}),
      reuse_existing: true,
    }) })
    assert.equal(result.status, 201)
    assert.equal(result.body.id, 79)
    assert.equal(inserted[spec.field], name)
    if (spec.label === 'unit') {
      assert.match(inserted.unit_code, /^U[0-9A-Z]{9}$/)
      assert.equal(inserted.unit_name_en, 'English unit name')
    }
    if (spec.label === 'item group') assert.equal(inserted.group_code, 'G000000079')
    assert.deepEqual(context.transactions, ['begin', 'commit'])
  })
}

for (const spec of apiCases.filter(spec => spec.label !== 'item group')) {
  test(`${spec.label} get-or-create does not reuse a deleted definition`, async () => {
    const deleted = { ...spec.row, status: 3 }
    const context = loadApi(spec, query => {
      if (query.startsWith('SELECT') && query.includes(`FROM ${spec.table}`)) {
        // Model only the status predicate: active lookups cannot see this row.
        if (/(?:COALESCE\(status,\s*1\)|status)\s*(?:<>|!=)\s*3/.test(query)) return []
        return [deleted]
      }
      if (query.startsWith('INSERT')) assert.fail('a deleted definition must be restored before using its name')
      return []
    })
    const result = await context.api.POST({ json: async () => ({ [spec.field]: spec.row[spec.field], reuse_existing: true }) })
    assert.equal(result.status, 409)
    assert.match(result.body.error, /محذوف/)
    assert.equal(result.body.id, undefined)
  })
}

test('item group get-or-create excludes deleted rows and avoids their reserved codes', async () => {
  const spec = apiCases.find(spec => spec.label === 'item group')
  const deleted = { ...spec.row, status: 3 }
  let inserted
  const context = loadApi(spec, (query, values) => {
    if (query.startsWith('SELECT') && query.includes('FROM item_groups')) {
      if (/(?:COALESCE\(status,\s*1\)|status)\s*(?:<>|!=)\s*3/.test(query)) return []
      if (!query.includes('group_name')) return values.includes(deleted.group_code) ? [deleted] : []
      return [deleted]
    }
    if (query.startsWith('INSERT')) {
      inserted = { id: 79, group_code: values[0], group_name: values[1], status: 1 }
      return [inserted]
    }
    return []
  })
  const result = await context.api.POST({ json: async () => ({ group_name: deleted.group_name, group_code: deleted.group_code, reuse_existing: true }) })
  assert.equal(result.status, 201)
  assert.equal(result.body.id, 79)
  assert.equal(inserted.group_code, 'G000000079')
  assert.notEqual(result.body.id, deleted.id)
})

test('item group creation advances beyond normalized legacy codes when the generated code collides', async () => {
  const spec = apiCases.find(spec => spec.label === 'item group')
  let codeChecks = 0
  const context = loadApi(spec, (query, values) => {
    if (query.startsWith('SELECT group_code FROM item_groups')) return [{ group_code: 'G000000079' }, { group_code: 'G0000000801' }]
    if (query.startsWith('SELECT id FROM item_groups WHERE group_code')) {
      assert.ok(++codeChecks <= 3, 'collision handling must advance instead of regenerating the same code indefinitely')
      return values.includes('G000000079') ? [{ id: 79 }] : []
    }
    if (query.startsWith('INSERT')) return [{ id: 81, group_code: values[0], group_name: values[1], status: 1 }]
    return []
  })
  const result = await context.api.POST({ json: async () => ({ group_name: 'New group', reuse_existing: true }) })
  assert.equal(result.status, 201)
  assert.equal(result.body.group_code, 'G000000081')
  assert.equal(result.body.group_code.length, 10)
})
