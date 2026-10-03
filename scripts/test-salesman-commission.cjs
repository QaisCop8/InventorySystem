const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const fs = require('node:fs')
const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('lib/salesman-commission.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
new Function('module', 'exports', code)(mod, mod.exports)
const { selectCommissionRule, calculateCommission, reverseCommission } = mod.exports

test('commission chooses the most specific matching rule', () => {
  const rules = [
    { id: 1, salesman_id: null, basis: 'sales', commission_percent: 1 },
    { id: 2, salesman_id: 7, customer_id: 9, basis: 'sales', commission_percent: 2 },
  ]
  assert.equal(selectCommissionRule(rules, { salesmanId: 7, customerId: 9, amount: 500 }).id, 2)
})

test('tiered commission selects the highest reached rate and snapshots return reversals', () => {
  const rule = { id: 1, salesman_id: 7, basis: 'tiered', tiers: [{ threshold: 10000, rate: 1 }, { threshold: 25000, rate: 2 }, { threshold: 50000, rate: 3 }] }
  assert.equal(calculateCommission(rule, { sales: 30000, grossProfit: 10000, collected: 0 }, 1, 30000).amount, 600)
  assert.equal(calculateCommission(rule, { sales: 2000, grossProfit: 500, collected: 0 }, -1, 30000).amount, -40)
})

test('gross-profit and collection bases calculate from their own snapshots', () => {
  assert.equal(calculateCommission({ basis: 'gross_profit', commission_percent: 5 }, { sales: 1000, grossProfit: 250, collected: 0 }).amount, 12.5)
  assert.equal(calculateCommission({ basis: 'collection', commission_percent: 3 }, { sales: 1000, grossProfit: 200, collected: 300 }).amount, 9)
})

test('linked return reverses the original invoice snapshot proportionally', () => {
  assert.equal(reverseCommission(300, 2000, 10000), -60)
  assert.equal(reverseCommission(300, 15000, 10000), -300)
})
