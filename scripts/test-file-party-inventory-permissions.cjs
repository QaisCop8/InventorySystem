const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const response = { json: (body, init = {}) => ({ body, status: init.status || 200 }) }
const denied = () => ({ ok: false, response: response.json({ error: 'Denied' }, { status: 403 }) })
const granted = () => ({ ok: true, userId: '1', branchId: 1, accessId: 1, lookupOnly: false })

function load(file, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'next/server') return { NextResponse: response }
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

test('party mutations authorize the stored subscriber type before a claimed customer type', async () => {
  const calls = []
  const api = load('app/api/customers/_permissions.ts', {
    '@/lib/database': { __esModule: true, default: async () => [{ type: 4 }] },
    '@/lib/tenant-auth': { getSessionUser: async () => ({ user_id: '1' }) },
    '@/lib/file-permissions': {
      authorizeFile: async (_, family, action) => { calls.push([family, action]); return denied() },
    },
  })
  assert.equal((await api.authorizeStoredCustomer({}, 12, 'update', 1)).response.status, 403)
  assert.deepEqual(calls, [['subscribers', 'update']])
})

test('changing a service into an item requires both stored update and destination create', async () => {
  const calls = []
  const api = load('app/api/inventory/products/_permissions.ts', {
    '@/lib/database': { __esModule: true, default: async () => [{ type: 2 }] },
    '@/lib/file-permissions': {
      authorizeFile: async (_, family, action) => {
        calls.push([family, action])
        return family === 'services' ? granted() : denied()
      },
    },
  })
  assert.equal((await api.authorizeStoredProduct({}, 24, 'update', 1)).response.status, 403)
  assert.deepEqual(calls, [['services', 'update'], ['items', 'create']])
})

test('mixed party import checks every family before compatibility or account writes', async () => {
  const permissions = [], writes = []
  const api = load('app/api/import/customers/route.ts', {
    '@/lib/database': { __esModule: true, default: async () => { writes.push('sql'); return [] } },
    '@/lib/number-generator': {},
    '@/app/api/customers/_lib': { ensureCustomerCompatibilityColumns: async () => writes.push('compatibility') },
    '@/app/api/settings/system/route': {},
    '@/app/api/customers/_permissions': {
      authorizeCustomerType: async (_, type, action) => {
        permissions.push([type, action]); return type === 1 ? granted() : denied()
      },
    },
  })
  const result = await api.POST({ json: async () => ({ data: [{ type: 1 }, { type: 2 }] }) })
  assert.equal(result.status, 403)
  assert.deepEqual(permissions, [[1, 'create'], [2, 'create']])
  assert.deepEqual(writes, [])
})

test('warehouse updates resolve their stored product rather than trusting submitted product_id', async () => {
  const queries = [], permissions = []
  const api = load('app/api/inventory/product-warehouses/route.ts', {
    '@/lib/database': { __esModule: true, default: async (strings) => {
      queries.push(strings.join('?')); return [{ product_id: 77 }]
    } },
    '@/app/api/inventory/products/_permissions': {
      authorizeStoredProduct: async (_, id, action) => { permissions.push([id, action]); return denied() },
    },
  })
  const result = await api.PUT({ json: async () => ({ id: 9, product_id: 1 }) })
  assert.equal(result.status, 403)
  assert.deepEqual(permissions, [[77, 'update']])
  assert.equal(queries.length, 1)
  assert.match(queries[0], /^SELECT product_id FROM product_warehouses/)
})

test('denied driver deletion performs no schema or record writes', async () => {
  const writes = []
  const api = load('app/api/drivers/[id]/route.ts', {
    '@/lib/file-permissions': { authorizeFile: async () => denied() },
    '../_lib': { __esModule: true, default: async () => writes.push('sql'), ensureDriversTable: async () => writes.push('schema') },
  })
  const result = await api.DELETE({}, { params: { id: '5' } })
  assert.equal(result.status, 403)
  assert.deepEqual(writes, [])
})
