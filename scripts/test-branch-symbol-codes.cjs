// Run: node --test scripts/test-branch-symbol-codes.cjs
// Voucher code = prefix + branch symbol + voucher book + sequence (e.g. INV + A + D + 00001 = INVAD00001).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const exportsOf = {}
new Function('exports', ts.transpileModule(fs.readFileSync('lib/voucher-code.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(exportsOf)
const { buildVoucherCode, parseTypedVoucherCode, BRANCH_SYMBOLS } = exportsOf

test('branch symbols are 0 then A-Z, all single unique characters', () => {
  assert.equal(BRANCH_SYMBOLS[0], '0')
  assert.equal(BRANCH_SYMBOLS[1], 'A')
  assert.equal(BRANCH_SYMBOLS.length, 27)
  assert.equal(new Set(BRANCH_SYMBOLS).size, 27)
  assert.ok(BRANCH_SYMBOLS.every(symbol => symbol.length === 1))
})

test('code is prefix + branch symbol + book + padded sequence (INV + A + D => INVAD00001)', () => {
  assert.equal(buildVoucherCode('INV', 'AD', 1), 'INVAD00001')
  assert.equal(buildVoucherCode('INV', '0D', 12), 'INV0D00012')
  assert.equal(buildVoucherCode('INV', 'AD', 5, 'x'), 'INVADX0005')
  assert.ok(buildVoucherCode('INV', 'AD', 123456789).length <= 10)
})

test('typed code blur: short numbers and complete codes of any branch are rebuilt for the current branch', () => {
  const rebuild = (raw, prefix = 'INV', segment = 'BD', symbol = 'B') => {
    const parsed = parseTypedVoucherCode(raw, prefix, segment, symbol)
    return parsed && buildVoucherCode(prefix, segment, parsed.sequence, parsed.userPrefix)
  }
  assert.equal(rebuild('5'), 'INVBD00005')
  assert.equal(rebuild('00007'), 'INVBD00007')
  assert.equal(rebuild('INVBD00009'), 'INVBD00009')
  assert.equal(rebuild('invbd00009'), 'INVBD00009')
  assert.equal(rebuild('INVAD00009'), 'INVBD00009', 'a code typed for another branch is rebuilt for the current branch')
  assert.equal(rebuild('INV0D00003', 'INV', '0D', '0'), 'INV0D00003')
  assert.equal(rebuild('A1'), 'INVBDA0001')
  assert.equal(rebuild('abc'), null)
  assert.equal(rebuild('INVBDBD00002'), 'INVBD00002', 'repeated segment is not duplicated on every blur')
})
