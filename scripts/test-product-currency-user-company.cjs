const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function employeeHarness({ localDuplicate = false, existingIdentity = true, racingInsert = false, usernameDuplicate = false } = {}) {
  const managementCalls = [], tenantCalls = []
  let identitySelects = 0
  const tenantSql = async (strings, ...values) => {
    const query = strings.join('?'); tenantCalls.push({ query, values })
    if (query.includes('SELECT user_id FROM user_settings')) {
      return localDuplicate || (usernameDuplicate && query.includes('username =')) ? [{ user_id: 1 }] : []
    }
    if (query.includes('INSERT INTO user_settings')) return [{ user_id: 9 }]
    return []
  }
  const client = {
    query: async (query, values) => {
      managementCalls.push({ query, values })
      if (query.includes('SELECT id FROM users')) {
        identitySelects++
        return { rows: existingIdentity || (racingInsert && identitySelects > 1) ? [{ id: 77 }] : [] }
      }
      if (query.includes('INSERT INTO users')) return { rows: racingInsert ? [] : [{ id: 78 }] }
      return { rows: [] }
    },
    release: () => {},
  }
  const dependencies = {
    './database': { __esModule: true, default: tenantSql, resolveCurrentDbName: async () => 'company_b' },
    './permissions': { ensurePermissionTables: async () => {} },
    './management-db': {
      __esModule: true,
      default: async () => [{ id: 2 }],
      ensureManagementTables: async () => {},
      getManagementPool: () => ({ connect: async () => client }),
    },
  }
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync('lib/auth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', code)(name => dependencies[name], mod, mod.exports)
  const create = () => mod.exports.createTenantEmployeeWithManagementLink({ username: 'employee', email: ' PERSON@example.com ', password: 'company-b-password', fullName: 'Employee', role: 'employee', department: 'sales', organizationId: 1 })
  return { create, tenantCalls, managementCalls }
}

test('an email in another company reuses identity without altering global credentials', async () => {
  const h = employeeHarness()
  assert.equal((await h.create()).success, true)
  const membership = h.managementCalls.find(c => c.query.includes('INSERT INTO user_company'))
  assert.deepEqual(membership.values, [77, 2])
  assert.equal(h.managementCalls.some(c => /(?:UPDATE|INSERT INTO) users/.test(c.query)), false)
  assert.ok(h.tenantCalls.find(c => c.query.includes('INSERT INTO user_settings')).values.includes('person@example.com'))
  assert.equal(h.managementCalls.at(-1).query, 'COMMIT')
})

test('duplicate email in current company is rejected before membership writes', async () => {
  const h = employeeHarness({ localDuplicate: true })
  assert.equal((await h.create()).success, false)
  assert.equal(h.managementCalls.length, 0)
  assert.equal(h.tenantCalls.some(c => c.query.includes('INSERT')), false)
})

test('first identity and concurrent identity creation both support new company membership', async () => {
  for (const racingInsert of [false, true]) {
    const h = employeeHarness({ existingIdentity: false, racingInsert })
    assert.equal((await h.create()).success, true)
    assert.match(h.managementCalls.find(c => c.query.includes('INSERT INTO users')).query, /ON CONFLICT \(email\) DO NOTHING/)
    assert.equal(h.managementCalls.find(c => c.query.includes('INSERT INTO user_company')).values[0], racingInsert ? 77 : 78)
  }
})

test('tenant creation failure rolls back new company membership', async () => {
  const h = employeeHarness({ usernameDuplicate: true })
  assert.equal((await h.create()).success, false)
  assert.equal(h.managementCalls.at(-1).query, 'ROLLBACK')
})

test('product currency picker uses currency ids even when rates differ or are missing', () => {
  const source = fs.readFileSync('components/products/compact-product-form.tsx', 'utf8')
  const start = source.indexOf('const currencies = (currenciesData.rates || [])')
  const end = source.indexOf('definitionsObj.currenciesData = currencies', start)
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const normalize = new Function('currenciesData', code + ';return currencies')
  const currencies = normalize({ rates: [{ id: 501, currency_id: 2 }, { id: null, currency_id: 3 }, { id: 9, currency_id: null }] })
  assert.deepEqual(currencies.map(c => c.id), [2, 3])
})

test('price validation rejects exchange-rate ids and invalid currency selections', async () => {
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync('lib/product-price-currencies.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('module', 'exports', code)(mod, mod.exports)
  const { validateProductPriceCurrencies } = mod.exports
  const queries = []
  const client = { query: async (query, values) => { queries.push({ query, values }); return { rows: [{ id: 2 }, { id: 3 }] } } }
  assert.equal(await validateProductPriceCurrencies(client, [{ currency_id: '2' }, { currency_id: 3 }, { currency_id: 2 }]), null)
  assert.deepEqual(queries[0].values, [[2, 3]])
  assert.match(queries[0].query, /FROM currency /)
  assert.match(await validateProductPriceCurrencies(client, [{ currency_id: 2 }, { currency_id: 501 }]), /للسطر 2/)
  for (const currency_id of [0, null, -1, 'invalid', 1.5]) {
    const count = queries.length
    assert.ok(await validateProductPriceCurrencies(client, [{ currency_id }]))
    assert.equal(queries.length, count)
  }
})
