// Run: node --test scripts/test-scale-barcodes.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../lib/scale-barcode.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exportsObject = {}
new Function('exports', compiled)(exportsObject)
const { parseScaleBarcode, resolvePosBarcode, validateScaleProductBarcodes, isScaleProduct } = exportsObject
const cartExports = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/pos-cart.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(cartExports)
const { posCartLineKey } = cartExports
const scale = { id: 1, barcode: '2000001', soldUsingScale: true, barcodeOptions: [{ barcode: '2000002', price: 12, unitId: 3 }] }

test('the requested barcode means item 2000001 and quantity 15', () => {
  assert.deepEqual(parseScaleBarcode('2000001015000'), { barcode: '2000001', quantity: 15 })
  assert.equal(resolvePosBarcode([scale], '2000001015000').product, scale)
})

test('fractional weights retain all three decimals', () => {
  assert.equal(parseScaleBarcode('2000001000001').quantity, 0.001)
  assert.equal(parseScaleBarcode('2000001001500').quantity, 1.5)
  assert.equal(parseScaleBarcode('2000001999999').quantity, 999.999)
})

test('scale products require at least one seven-digit numeric barcode', () => {
  for (const barcodes of [[], [''], ['200001'], ['20000010'], ['20A0001'], ['2000001', 'invalid']]) {
    assert.ok(validateScaleProductBarcodes(true, barcodes))
  }
  assert.equal(validateScaleProductBarcodes(true, ['2000001', ' 2000002 ']), null)
  assert.equal(validateScaleProductBarcodes(false, ['ABC1234567890']), null)
})

test('zero weights and malformed labels are rejected', () => {
  for (const barcode of ['2000001000000', '200000101500', '20000010150000', '2000001-15000', '2000001ABCDEF']) {
    assert.equal(parseScaleBarcode(barcode), null)
  }
})

test('a prefix match must belong to a scale-enabled product', () => {
  assert.equal(resolvePosBarcode([{ ...scale, soldUsingScale: false }], '2000001015000'), null)
  assert.equal(resolvePosBarcode([scale], '2000099015000'), null)
})

test('a unit barcode resolves to its own price and unit', () => {
  const result = resolvePosBarcode([scale], '2000002001250')
  assert.equal(result.barcode, '2000002')
  assert.equal(result.quantity, 1.25)
  const option = result.product.barcodeOptions.find(row => row.barcode === result.barcode)
  assert.equal(option.price, 12)
  assert.equal(option.unitId, 3)
})

test('ordinary exact barcodes take precedence over scale prefixes', () => {
  const ordinary = { id: 2, barcode: '2000001015000', soldUsingScale: false, barcodeOptions: [] }
  const result = resolvePosBarcode([scale, ordinary], ordinary.barcode)
  assert.equal(result.product.id, 2)
  assert.equal(result.quantity, 1)
  assert.equal(resolvePosBarcode([scale], '2000001').quantity, 1)
})

test('the actual cashier add handler accumulates scanned weights rather than units', () => {
  const cashier = fs.readFileSync(path.join(__dirname, '../components/pos/pos-cashier.tsx'), 'utf8')
  const handler = cashier.match(/ const add=(.*)\r?\n/)[1]
  let cart = []
  const js = ts.transpileModule(`const add=${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  const add = () => new Function('cart', 'setCart', 'setHistorySelected', 'setSelectedLineId', 'setQuantityEntry', 'setBarcodeQuery', 'requestAnimationFrame', 'searchRef', 'posCartLineKey', js + ';return add')(
    cart, updater => { cart = updater(cart) }, () => {}, () => {}, () => {}, () => {}, callback => callback(), { current: null }, posCartLineKey,
  )
  add()(scale, 1.25)
  add()(scale, 0.001)
  assert.equal(cart.length, 1)
  assert.equal(cart[0].quantity, 1.251)
  add()(scale)
  assert.equal(cart[0].quantity, 2.251)
})

test('scanning a second unit adds its own line and price; quantity edits affect only that unit', () => {
  const cashier = fs.readFileSync(path.join(__dirname, '../components/pos/pos-cashier.tsx'), 'utf8')
  const handler = cashier.match(/ const add=(.*)\r?\n/)[1]
  const js = ts.transpileModule(`const add=${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  let cart = []
  let selectedLineId = null
  const setCart = updater => { cart = updater(cart) }
  const scan = barcode => {
    const product = { ...scale, unitId: 1, price: 2 }
    const resolved = resolvePosBarcode([product], barcode)
    const option = product.barcodeOptions.find(row => row.barcode === resolved.barcode)
    const matched = option ? { ...product, ...option } : product
    const add = new Function('cart', 'setCart', 'setHistorySelected', 'setSelectedLineId', 'setQuantityEntry', 'setBarcodeQuery', 'requestAnimationFrame', 'searchRef', 'posCartLineKey', js + ';return add')(
      cart, setCart, () => {}, value => { selectedLineId = value }, () => {}, () => {}, callback => callback(), { current: null }, posCartLineKey,
    )
    add(matched, resolved.quantity)
  }
  scan('2000001')
  scan('2000002')
  scan('2000002')
  assert.deepEqual(cart.map(row => [row.id,row.unitId,row.price,row.quantity]), [[1,1,2,1],[1,3,12,2]])
  assert.equal(selectedLineId, '1:3')
  const quantityHandler = cashier.match(/ const applyQuantity=(.*)\r?\n/)[1]
  new Function('setCart', 'selectedLineId', 'quantityEntry', 'posCartLineKey', `return (${quantityHandler})()`)(setCart, selectedLineId, '5', posCartLineKey)
  assert.deepEqual(cart.map(row => row.quantity), [1,5])
  scan('2000001')
  assert.deepEqual(cart.map(row => row.quantity), [2,5])
})

test('legacy numeric and boolean flags normalize consistently', () => {
  for (const value of [true, 1, '1', 'true']) assert.equal(isScaleProduct(value), true)
  for (const value of [false, 0, '0', 'false', null, undefined]) assert.equal(isScaleProduct(value), false)
})
