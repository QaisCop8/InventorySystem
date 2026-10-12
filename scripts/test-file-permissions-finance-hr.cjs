const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const test = require("node:test")
const ts = require("typescript")

const root = path.resolve(__dirname, "..")
const response = (body, options = {}) => ({ body, status: options.status || 200 })
const denied = { ok: false, response: response({ error: "denied" }, { status: 403 }) }
const granted = { ok: true, userId: "test-user", branchId: 1, lookupOnly: false, accessId: 1 }

function harness(options = {}) {
  const effects = []
  const checks = []
  const cache = new Map()
  const sql = async (parts, ...values) => {
    const query = typeof parts === "string" ? parts : parts.join("?")
    effects.push({ query, values })
    return options.rows ? options.rows(query, values) : []
  }
  sql.unsafe = (query, values = []) => sql(query, ...values)
  const permissionApi = {
    authorizeFile: async (_request, family, action) => {
      checks.push({ family, action })
      return options.authorization ? options.authorization(family, action) : denied
    },
    authorizeFileRead: async (_request, families) => {
      checks.push({ family: families[0], action: "read" })
      return options.authorization ? options.authorization(families[0], "read") : denied
    },
    projectFileLookup: (...args) => load("lib/file-permissions.ts", true).projectFileLookup(...args),
  }
  const mocks = {
    "next/server": { NextResponse: { json: response } },
    "@/lib/database": { __esModule: true, default: sql, resolveCurrentDbName: async () => "test" },
    "@/lib/tenant-auth": { getSessionUser: async () => options.session === false ? null : { user_id: "test-user" } },
    "@/lib/hr-schema": { ensureHrSchema: async () => effects.push({ query: "ensureHrSchema" }) },
    "@/lib/permissions": { ensureFilePermissions: async () => {}, LEGACY_FULL_ACCESS_SQL: "FALSE" },
    "@/lib/company-license": { assertLicenseAllows: async () => {}, licenseErrorResponseBody: () => null },
  }
  function load(relative, realPermissions = false) {
    const filename = path.resolve(root, relative)
    if (cache.has(filename)) return cache.get(filename)
    const source = fs.readFileSync(filename, "utf8")
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } })
    const module = { exports: {} }
    cache.set(filename, module.exports)
    const localRequire = (specifier) => {
      if (specifier === "@/lib/file-permissions" && !realPermissions) return permissionApi
      if (mocks[specifier]) return mocks[specifier]
      if (specifier === "@/lib/file-permission-definitions" || specifier === "@/lib/transaction-permission-definitions") {
        return load(specifier.slice(2) + ".ts")
      }
      if (specifier.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(filename), specifier + ".ts")))
      return new Proxy({}, { get: (_target, name) => name === "__esModule" ? true : async () => {} })
    }
    vm.runInNewContext("(function(require,module,exports){" + compiled.outputText + "\n})", { console, URL, Set, Map, Object, Number, String, Date })(localRequire, module, module.exports)
    cache.set(filename, module.exports)
    return module.exports
  }
  return { effects, checks, load }
}

function request(body = {}, suffix = "") {
  const url = "http://localhost/api/example/1" + suffix
  return { url, nextUrl: new URL(url), headers: { get: () => "1" }, json: async () => body }
}

const standardRoutes = [
  ["banks", "app/api/banks/route.ts", ["GET", "POST", "PUT", "DELETE"]],
  ["bank-accounts", "app/api/bank-accounts/route.ts", ["GET", "POST", "PUT", "DELETE"]],
  ["branches", "app/api/branches/route.ts", ["GET", "POST", "PUT", "DELETE"]],
  ["branches", "app/api/branches/[id]/route.ts", ["GET", "PUT", "DELETE"]],
  ["credit-cards", "app/api/credit-cards/route.ts", ["GET", "POST", "PUT"]],
  ["credit-cards", "app/api/credit-cards/[id]/route.ts", ["GET"]],
  ["accounts", "app/api/accounts/route.ts", ["GET", "POST"]],
  ["accounts", "app/api/accounts/search/route.ts", ["GET"]],
  ["accounts", "app/api/accounts/[id]/route.ts", ["GET"]],
  ["accounts", "app/api/accounts/next-code/route.ts", ["GET"]],
  ...["banks", "bank-accounts", "branches", "credit-cards"].map(family => [family, `app/api/${family}/navigation/[navigationType]/route.ts`, ["GET"]]),
]

for (const [family, filename, methods] of standardRoutes) {
  for (const method of methods) test(`${method} ${filename} denies before database/schema work`, async () => {
    const state = harness()
    const result = await state.load(filename)[method](request({ id: 1 }), { params: { id: "1", navigationType: "first" } })
    assert.equal(result.status, 403)
    assert.equal(state.checks[0].family, family)
    assert.deepEqual(state.effects, [])
  })
}

for (const method of ["GET", "POST", "PUT", "DELETE"]) test(`employee ${method} denies before schema/card/account side effects`, async () => {
  const state = harness()
  const result = await state.load("app/api/hr/[resource]/route.ts")[method](request({ id: 1, father_account: "12", card_number: "42" }), { params: { resource: "employees" } })
  assert.equal(result.status, 403)
  assert.deepEqual(state.effects, [])
})

test("employee number generation requires create permission", async () => {
  const state = harness()
  const result = await state.load("app/api/hr/[resource]/route.ts").GET(request(), { params: { resource: "employee-number" } })
  assert.equal(result.status, 403)
  assert.deepEqual(state.checks, [{ family: "employees", action: "create" }])
  assert.deepEqual(state.effects, [])
})

for (const [family, filename] of [
  ["banks", "app/api/banks/route.ts"], ["bank-accounts", "app/api/bank-accounts/route.ts"],
  ["branches", "app/api/branches/route.ts"], ["branches", "app/api/branches/[id]/route.ts"],
  ["credit-cards", "app/api/credit-cards/route.ts"], ["employees", "app/api/hr/[resource]/route.ts"],
]) test(`PUT ${filename} cannot soft-delete with update permission`, async () => {
  const state = harness({ authorization: (_family, action) => action === "update" ? granted : denied })
  const result = await state.load(filename).PUT(request({ id: 1, status: "3" }), { params: { id: "1", resource: "employees" } })
  assert.equal(result.status, 403)
  assert.deepEqual(state.checks, [{ family, action: "delete" }])
  assert.deepEqual(state.effects, [])
})

for (const [type, family] of [[1, "accounts"], [2, "customers"], [3, "suppliers"], [5, "subscribers"]]) {
  test(`account PUT checks stored ${family} family despite a forged body type`, async () => {
    const state = harness({ rows: query => query.includes("SELECT id, type") ? [{ id: 1, type }] : [] })
    const result = await state.load("app/api/accounts/[id]/route.ts").PUT(request({ type: 1, status: 1 }), { params: { id: "1" } })
    assert.equal(result.status, 403)
    assert.deepEqual(state.checks, [{ family, action: "update" }])
    assert.equal(state.effects.length, 1)
    assert.match(state.effects[0].query, /SELECT id, type/)
  })
}

test("unauthenticated account PUT cannot query stored records", async () => {
  const state = harness({ session: false })
  const result = await state.load("app/api/accounts/[id]/route.ts").PUT(request(), { params: { id: "1" } })
  assert.equal(result.status, 401)
  assert.deepEqual(state.effects, [])
})

for (const filename of ["app/api/accounts/[id]/route.ts", "app/api/accounts/search/route.ts"]) {
  test(`${filename} projects an account when the stored customer family has no query grant`, async () => {
    const state = harness({
      authorization: family => ({ ...granted, lookupOnly: family === "customers" }),
      rows: query => query.includes("FROM account_tbl a") ? [{ id: 1, type: 2, code: "C001", name: "Customer", status: 1, notes: "private", max_balance_amount: 50000 }] : [],
    })
    const result = await state.load(filename).GET(request({}, "?code=C001"))
    assert.equal(result.status, 200)
    assert.equal(result.body.code, "C001")
    assert.equal(result.body.notes, undefined)
    assert.equal(result.body.max_balance_amount, undefined)
    assert.deepEqual(state.checks.map(check => check.family), ["accounts", "customers"])
  })
}

test("branch bootstrap lookup filters branch memberships and private details", async () => {
  const state = harness({
    authorization: () => ({ ...granted, lookupOnly: true }),
    rows: query => query.includes("FROM user_branches") ? [{ branch_id: 2 }] : query.includes("FROM branches") ? [
      { id: 1, branch_code: "1", branch_name: "Other", phone: "private" },
      { id: 2, branch_code: "2", branch_name: "Allowed", phone: "private", manager: "private" },
    ] : [],
  })
  const result = await state.load("app/api/branches/route.ts").GET(request())
  assert.equal(result.status, 200)
  assert.equal(result.body.length, 1)
  assert.equal(result.body[0].id, 2)
  assert.equal(result.body[0].phone, undefined)
  assert.equal(result.body[0].manager, undefined)
})

test("employee picker omits personal, salary, and card details", async () => {
  const state = harness({
    authorization: () => ({ ...granted, lookupOnly: true }),
    rows: query => query.includes("FROM employees_tbl e") ? [{ id: 1, employee_code: "E1", full_name: "Employee", salary_account: "123", basic_salary: 1000, national_id: "private", card_number: "private" }] : [],
  })
  const result = await state.load("app/api/hr/[resource]/route.ts").GET(request(), { params: { resource: "employees" } })
  assert.equal(result.body[0].full_name, "Employee")
  for (const field of ["salary_account", "basic_salary", "national_id", "card_number"]) assert.equal(result.body[0][field], undefined)
})

test("bank account picker omits actual bank account numbers and commissions", async () => {
  const state = harness({
    authorization: () => ({ ...granted, lookupOnly: true }),
    rows: query => query.includes("SELECT * FROM bank_accounts") ? [{ id: 1, code: "B1", name: "Bank", actual_bank_code: "private", returned_checks_commission: 25, notes: "private" }] : [],
  })
  const result = await state.load("app/api/bank-accounts/route.ts").GET(request())
  assert.equal(result.body[0].code, "B1")
  for (const field of ["actual_bank_code", "returned_checks_commission", "notes"]) assert.equal(result.body[0][field], undefined)
})
