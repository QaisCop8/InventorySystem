// معادلات أنواع القياس (products.measurment_id) — نسخة نقية مشتركة بين الخادم والواجهة، مطابقة حرفياً
// لـ measurementRequires*/recalcQuantityFromMeasurement بسندات المخزون (app/api/stock-vouchers/_lib.ts)
// والتي يتحقق بها الخادم أن الكمية = ناتج المعادلة عند حفظ أي سند.

export const MEASUREMENT_NORMAL = 1

export const measurementRequiresLength = (id: number) => [2, 3, 4, 5, 8, 9, 10].includes(Number(id))
export const measurementRequiresWidth = (id: number) => [2, 3, 6, 8, 9].includes(Number(id))
export const measurementRequiresHeight = (id: number) => Number(id) === 3
export const measurementRequiresCount = (id: number) => Number(id || 1) !== MEASUREMENT_NORMAL
export const isMeasuredProduct = (id: unknown) => Number(id || 1) !== MEASUREMENT_NORMAL

export type MeasurementProduct = { measurment_id?: number | null; length?: number | null; width?: number | null; density?: number | null }

export function quantityFromMeasurement(product: MeasurementProduct, dims: { length?: unknown; width?: unknown; height?: unknown; count?: unknown }) {
  const length = Number(dims.length || 0)
  const width = Number(dims.width || 0)
  const height = Number(dims.height || 0)
  const count = Number(dims.count || 0)
  const productLength = Number(product.length || 0)
  const productWidth = Number(product.width || 0)
  const productDensity = Number(product.density || 0)
  switch (Number(product.measurment_id || 1)) {
    case 2:
    case 8:
      return width * length * count
    case 3:
      return length * width * height * count
    case 4:
    case 5:
      return length * count
    case 6:
      return (2 * length + 2 * width) * count
    case 7:
      return count
    case 9:
      return (productLength * length + productWidth * width) * count
    case 10:
      return productDensity * length * count
    default:
      return count
  }
}

/** هل أبعاد الدفعة كافية لنوع القياس (لا يمكن ترحيل تسوية لصنف بقياس بلا أبعاده المطلوبة). */
export function hasRequiredDimensions(measurmentId: number, dims: { length?: unknown; width?: unknown; height?: unknown }) {
  if (measurementRequiresLength(measurmentId) && !(Number(dims.length) > 0)) return false
  if (measurementRequiresWidth(measurmentId) && !(Number(dims.width) > 0)) return false
  if (measurementRequiresHeight(measurmentId) && !(Number(dims.height) > 0)) return false
  return true
}

export function dimensionsLabel(dims: { length?: unknown; width?: unknown; height?: unknown }) {
  const parts = [dims.length, dims.width, dims.height].map((value) => Number(value || 0)).filter((value) => value > 0)
  return parts.length ? parts.map((value) => Number(value.toFixed(4))).join(" × ") : ""
}
