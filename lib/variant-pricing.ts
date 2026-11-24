import { categoryAttributeDeltas } from "@/lib/attribute-prices"

/**
 * أسعار «المتغيرات والخصائص» عند تغيير قيمة متغير على سطر (طلبية سريعة، طلبية المبيعات، شاشة الارساليات/الفواتير) — 2026-11-24.
 * السطر المحفوظ قد لا يحمل value_prices (سند أُعيد فتحه) ⇐ تُقرأ خصائص الصنف وسعره من الخادم بفئة السعر المطلوبة.
 */
export type PricedAttribute = { name: string; values: string[]; value_prices?: Record<string, unknown>; base_price?: unknown; value_images?: Record<string, string | null> }

export async function loadVariantPricing(productId: number, priceCategoryId = 1): Promise<{ attributes: PricedAttribute[]; basePrice: number }> {
  try {
    const response = await fetch(`/api/inventory/products?productId=${productId}&priceCategoryId=${priceCategoryId || 1}`, { cache: "no-store" })
    const rows = response.ok ? await response.json() : []
    const product = Array.isArray(rows) ? rows[0] : null
    return { attributes: Array.isArray(product?.attributes) ? product.attributes : [], basePrice: Number(product?.first_price) || 0 }
  } catch {
    return { attributes: [], basePrice: 0 }
  }
}

/** مجموع فروق أسعار القيم المختارة عن سعر الصنف (بعملة سعر الصنف) */
export function variantPriceDelta(attributes: PricedAttribute[] | undefined, chosen: Record<string, string> | undefined, basePrice: number, priceCategoryId = 1) {
  let delta = 0
  for (const [group, value] of Object.entries(chosen || {})) {
    const attribute = (Array.isArray(attributes) ? attributes : []).find((entry) => entry?.name === group)
    if (attribute) delta += Number(categoryAttributeDeltas(attribute, basePrice, priceCategoryId || 1)[value] || 0)
  }
  return Math.round(delta * 10000) / 10000
}

/** فرق السعر عند تبديل قيمة: فرق القيم الجديدة − فرق القيم القديمة */
export async function variantPriceChange(productId: number, before: Record<string, string> | undefined, after: Record<string, string> | undefined, priceCategoryId = 1) {
  const { attributes, basePrice } = await loadVariantPricing(productId, priceCategoryId)
  return variantPriceDelta(attributes, after, basePrice, priceCategoryId) - variantPriceDelta(attributes, before, basePrice, priceCategoryId)
}
