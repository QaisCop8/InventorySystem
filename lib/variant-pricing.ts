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

/**
 * سعر قيمة بفئة سعر: { [فئة]: سعر } ⇐ سعر الفئة المطلوبة، وإن لم يُحدَّد لها سعر فالفئة 1 ثم أول فئة محفوظة
 * (كان يُعطي فرقاً صفراً إذا كانت فئة الطلبية بلا سعر للقيمة). رقم واحد = الصيغة القديمة (فرق عن base_price).
 */
function valuePriceFor(attribute: PricedAttribute, value: string, priceCategoryId: number): number | null {
  const raw = attribute.value_prices && typeof attribute.value_prices === "object" ? (attribute.value_prices as Record<string, unknown>)[value] : undefined
  if (raw && typeof raw === "object") {
    const prices = raw as Record<string, unknown>
    const pick = [String(priceCategoryId || 1), "1", ...Object.keys(prices)]
      .map((key) => Number(prices[key]))
      .find((amount) => Number.isFinite(amount) && amount > 0)
    return pick ?? null
  }
  return null
}

/** مجموع فروق أسعار القيم المختارة عن سعر الصنف (بعملة سعر الصنف) */
export function variantPriceDelta(attributes: PricedAttribute[] | undefined, chosen: Record<string, string> | undefined, basePrice: number, priceCategoryId = 1) {
  let delta = 0
  for (const [group, value] of Object.entries(chosen || {})) {
    const attribute = (Array.isArray(attributes) ? attributes : []).find((entry) => entry?.name === group)
    if (!attribute) continue
    const price = valuePriceFor(attribute, value, priceCategoryId)
    delta += price !== null ? price - basePrice : Number(categoryAttributeDeltas(attribute, basePrice, priceCategoryId || 1)[value] || 0)
  }
  return Math.round(delta * 10000) / 10000
}

/**
 * الاختيار المحفوظ على سطر قد يأتي بأشكال مختلفة: { المتغير: القيمة } أو مصفوفة قيم (features في الطلبيات) أو مفاتيح
 * لا تطابق أسماء المتغيرات — أو فارغاً والقيمة موجودة فقط في اسم السطر «(الحجم: كبير)». يُعاد بناؤه { المتغير: القيمة }.
 */
export function normalizeVariantSelection(attributes: PricedAttribute[] | undefined, chosen: unknown, lineName?: string): Record<string, string> {
  const list = Array.isArray(attributes) ? attributes : []
  const result: Record<string, string> = {}
  const entries: Array<[string, string]> = Array.isArray(chosen)
    ? chosen.map((value, index) => [String(index), String(value)])
    : chosen && typeof chosen === "object" ? Object.entries(chosen as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]) : []
  for (const [key, value] of entries) {
    const byName = list.find((attribute) => attribute.name === key && attribute.values?.includes(value))
    const byValue = byName || list.find((attribute) => !result[attribute.name] && attribute.values?.includes(value))
    if (byValue) result[byValue.name] = value
  }
  if (lineName) {
    for (const attribute of list) {
      if (result[attribute.name]) continue
      const value = (attribute.values || []).find((candidate) => lineName.includes(`${attribute.name}: ${candidate}`))
      if (value) result[attribute.name] = value
    }
  }
  return result
}

/** اسم الصنف بلا لاحقة الخصائص «(الحجم: كبير)» (قد تتكرر) */
export const baseVariantName = (name: string) => String(name || "").replace(/(\s*\([^)]*:[^)]*\))+\s*$/, "").trim()

/** فرق السعر عند تبديل قيمة: فرق القيم الجديدة − فرق القيم القديمة (lineName: اسم السطر لاستخراج القيمة القديمة إن لم تُحفظ) */
export async function variantPriceChange(productId: number, before: unknown, after: Record<string, string> | undefined, priceCategoryId = 1, lineName?: string) {
  const { attributes, basePrice } = await loadVariantPricing(productId, priceCategoryId)
  const previous = normalizeVariantSelection(attributes, before, lineName)
  return variantPriceDelta(attributes, after, basePrice, priceCategoryId) - variantPriceDelta(attributes, previous, basePrice, priceCategoryId)
}
