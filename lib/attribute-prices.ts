/**
 * أسعار خصائص الصنف («المتغيرات والخصائص» في تعريف الصنف) — 2026-11-20.
 * كل قيمة لها سعر (افتراضياً سعر الصنف نفسه)، ويُحفظ مع المتغير base_price = سعر الصنف المرجعي وقت التعريف.
 * عند البيع (الكاشير والمطعم) فرق القيمة = سعرها − base_price يُضاف لسعر السطر بفئة سعره (طاولات/سفري/نقطة البيع)،
 * فقيمة بنفس سعر الصنف لا تغيّر شيئاً، و«كبير» بسعر 8 لصنف سعره 5 يرفع السطر 3.
 */
export type AttributeGroupPrices = { name: string; values: string[]; value_prices?: Record<string, number>; base_price?: number }
export type SelectedAddon = { group: string; value: string }

const round4 = (value: number) => Math.round(value * 10000) / 10000

/** فرق كل قيمة عن سعر الصنف (القيم بلا فرق لا تُدرج) */
export function attributeDeltas(group: { value_prices?: Record<string, unknown> | null; base_price?: unknown }): Record<string, number> {
  const base = Number(group?.base_price)
  const prices = group?.value_prices && typeof group.value_prices === "object" ? group.value_prices : {}
  const deltas: Record<string, number> = {}
  if (!Number.isFinite(base)) return deltas
  for (const [value, raw] of Object.entries(prices)) {
    const price = Number(raw)
    if (!Number.isFinite(price)) continue
    const delta = round4(price - base)
    if (delta !== 0) deltas[value] = delta
  }
  return deltas
}

/** مجموع فروق القيم المختارة لسطر (groups من الكتالوج: { name, prices: فرق كل قيمة }) */
export function addonsPriceDelta(groups: { name: string; prices?: Record<string, number> }[] | undefined, addons: SelectedAddon[] | undefined) {
  let total = 0
  for (const addon of addons || []) {
    const group = (groups || []).find((row) => row.name === addon.group)
    total += Number(group?.prices?.[addon.value] || 0)
  }
  return round4(total)
}

/**
 * فرق سعر كل قيمة عن سعر الصنف بفئة سعر معيّنة (2026-11-20): value_prices[قيمة] = { [فئة السعر]: سعر } —
 * السعر الفعلي للسطر بتلك الفئة (بعملة سعر الصنف ⇐ factor يحوّله لعملة النقطة)؛ أو رقم واحد (الصيغة القديمة: الفرق
 * عن base_price المرجعي). basePrice = سعر الصنف بنفس الفئة (بعملة النقطة).
 */
export function categoryAttributeDeltas(group: { value_prices?: Record<string, unknown> | null; base_price?: unknown }, basePrice: number, priceCategoryId: number | null, factor = 1): Record<string, number> {
  const legacy = attributeDeltas(group as any)
  const prices = group?.value_prices && typeof group.value_prices === "object" ? group.value_prices : {}
  const deltas: Record<string, number> = {}
  for (const [value, raw] of Object.entries(prices)) {
    if (raw && typeof raw === "object") {
      if (!priceCategoryId) continue
      const amount = Number((raw as Record<string, unknown>)[String(priceCategoryId)])
      if (!Number.isFinite(amount)) continue
      const delta = round4(amount * factor - basePrice)
      if (delta !== 0) deltas[value] = delta
    } else if (legacy[value] !== undefined) deltas[value] = legacy[value]
  }
  return deltas
}
