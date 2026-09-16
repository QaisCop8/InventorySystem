export const SCALE_BARCODE_ERROR = "باركود الصنف المباع بالميزان الإلكتروني يجب أن يتكون من 7 أرقام، مثل 2000001"

export const isScaleProduct = (value: unknown) => value === true || value === 1 || value === "1" || value === "true"
export const isScaleItemBarcode = (value: string) => /^\d{7}$/.test(value.trim())

export function validateScaleProductBarcodes(enabled: unknown, barcodes: unknown[]): string | null {
  if (!isScaleProduct(enabled)) return null
  const values = barcodes.map(value => String(value ?? "").trim()).filter(Boolean)
  return !values.length || values.some(value => !isScaleItemBarcode(value)) ? SCALE_BARCODE_ERROR : null
}

export function parseScaleBarcode(value: string) {
  const barcode = value.trim()
  if (!/^\d{13}$/.test(barcode)) return null
  const quantity = Number(barcode.slice(7)) / 1000
  return quantity > 0 ? { barcode: barcode.slice(0, 7), quantity } : null
}

type BarcodeProduct = { barcode: string; soldUsingScale: boolean; barcodeOptions: Array<{ barcode: string }> }
export function resolvePosBarcode<T extends BarcodeProduct>(products: T[], value: string) {
  const term = value.trim()
  const matches = (product: T, barcode: string) => product.barcode === barcode || product.barcodeOptions.some(row => row.barcode === barcode)
  const exact = products.find(product => matches(product, term))
  if (exact) return { product: exact, barcode: term, quantity: 1 }
  const scale = parseScaleBarcode(term)
  if (!scale) return null
  const product = products.find(product => product.soldUsingScale && matches(product, scale.barcode))
  return product ? { product, ...scale } : null
}
