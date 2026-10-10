// ─────────────────────────────────────────────────────────────────────────────────────────────
// الضريبة على مستوى الصنف (إعداد "الضريبة على مستوى الصنف" — vat_on_item_level في الإعدادات العامة؛
// يقابل EnableVatItemLevel = 5 في ShamelAPI). عند تفعيله: نسبة ضريبة كل سطر = نسبة الصنف (تصنيفه
// الضريبي tax_classifications.tax_percent، ثم products.tax_rate)، وإن لم تُعرَّف للصنف نسبة تُستخدم نسبة
// السند. (صنف بلا تصنيف ⇐ 0؛ حقل نسبة السند معطَّل ويعرض النسبة الفعلية). ضريبة السند = مجموع ضرائب الأسطر، بعد توزيع خصم السند على الأسطر بالتناسب مع صافيها.
// عند إيقافه: الضريبة = (المجموع − الخصم) × نسبة السند (السلوك السابق).
// دالة واحدة مشتركة بين الواجهة (الإرساليات/الفواتير، طلبيات المبيعات) والخادم حتى يتطابق المبلغ.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const ITEM_LEVEL_VAT_SETTING = "vat_on_item_level"

export type VatLineInput = {
  quantity: number
  unitPrice: number
  /** نسبة خصم السطر % */
  discountPercent?: number
  /** خصم مبلغ ثابت على السطر (خصم الحملة، أو مبلغ الخصم في طلبية المبيعات) */
  discountAmount?: number
  /** نسبة ضريبة الصنف (null = غير معرّفة ⇐ نسبة السند) */
  vatRate?: number | null
}

export type VoucherTaxResult = {
  subtotal: number
  discount: number
  tax: number
  total: number
  /** لكل سطر: الصافي بعد خصم السطر وحصته من خصم السند، النسبة المطبّقة، ومبلغ ضريبته */
  lines: { net: number; rate: number; vat: number }[]
}

export function settingEnabled(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1"
}

export function computeVoucherTax(
  lines: VatLineInput[],
  options: { discountType?: "percentage" | "amount" | string | null; discountValue?: number | null; vatPercent?: number | null; itemLevel?: boolean },
): VoucherTaxResult {
  const vatPercent = Number(options.vatPercent || 0)
  const lineNets = lines.map((line) => {
    const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0)
    return gross * (1 - Number(line.discountPercent || 0) / 100) - Number(line.discountAmount || 0)
  })
  const subtotal = lineNets.reduce((sum, value) => sum + value, 0)
  const discountValue = Number(options.discountValue || 0)
  const discount = options.discountType === "amount" ? discountValue : (subtotal * discountValue) / 100
  const afterDiscount = subtotal - discount
  // حصة كل سطر من خصم السند بالتناسب مع صافيه
  const factor = subtotal !== 0 ? afterDiscount / subtotal : 1
  const resultLines = lineNets.map((net, index) => {
    // على مستوى الصنف: نسبة التصنيف الضريبي للصنف — صنف بلا تصنيف ⇐ 0 (حقل نسبة السند معطَّل في هذا الوضع)
    const lineRate = options.itemLevel ? (lines[index].vatRate ?? 0) : vatPercent
    const rate = Number.isFinite(Number(lineRate)) ? Number(lineRate) : vatPercent
    const lineNet = net * factor
    return { net: lineNet, rate, vat: (lineNet * rate) / 100 }
  })
  const tax = options.itemLevel ? resultLines.reduce((sum, line) => sum + line.vat, 0) : (afterDiscount * vatPercent) / 100
  return { subtotal, discount, tax, total: afterDiscount + tax, lines: resultLines }
}

/** السعر غير شامل الضريبة من سعر شامل بنسبة معيّنة. */
export const netFromInclusive = (price: number, rate: number) => (rate > 0 ? Math.round((price / (1 + rate / 100)) * 100) / 100 : price)
