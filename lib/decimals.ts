// عدد الخانات العشرية في المبالغ والتقارير (إعدادات السندات العامة: decimal_places_count) — مصدر واحد لكل
// تنسيقات المبالغ المعروضة في النظام بدل "2" الثابتة. القيمة تُزامَن إلى localStorage['systemSettingsList']
// (المعرّف 17) عبر lib/system-settings-sync.ts عند بدء التطبيق وبعد حفظ الإعدادات؛ على الخادم (بلا localStorage)
// تُستخدم القيمة الافتراضية 2.
const SETTING_ID = 17
const DEFAULT_DECIMALS = 2

export function amountDecimals(): number {
  if (typeof window === "undefined") return DEFAULT_DECIMALS
  try {
    const list = JSON.parse(localStorage.getItem("systemSettingsList") || "[]")
    const entry = Array.isArray(list) ? list.find((row: any) => String(row?.id) === String(SETTING_ID)) : null
    const value = Number(entry?.value ?? entry?.default_value)
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : DEFAULT_DECIMALS
  } catch {
    return DEFAULT_DECIMALS
  }
}

/** خيارات toLocaleString للمبالغ: نفس عدد الخانات للحد الأدنى والأقصى. */
export function amountFractionOptions(): Intl.NumberFormatOptions {
  const digits = amountDecimals()
  return { minimumFractionDigits: digits, maximumFractionDigits: digits }
}

/** بديل new Intl.NumberFormat(locale, {2,2}) يقرأ الإعداد عند كل تنسيق (الإعداد قد يُحمَّل بعد تحميل الصفحة). */
export function amountNumberFormat(locale = "en-US") {
  return { format: (value: number | bigint) => new Intl.NumberFormat(locale, amountFractionOptions()).format(value) }
}

/** تنسيق مبلغ مباشرة بعدد الخانات المعتمد. */
export function formatAmount(value: unknown, locale = "en-US") {
  const number = Number(value)
  return (Number.isFinite(number) ? number : 0).toLocaleString(locale, amountFractionOptions())
}
