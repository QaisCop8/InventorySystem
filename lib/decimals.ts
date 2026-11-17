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

function readSetting(id: number): unknown {
  if (typeof window === "undefined") return undefined
  try {
    const list = JSON.parse(localStorage.getItem("systemSettingsList") || "[]")
    const entry = Array.isArray(list) ? list.find((row: any) => String(row?.id) === String(id)) : null
    return entry ? (entry.value ?? entry.default_value) : undefined
  } catch {
    return undefined
  }
}

/** «اظهار فواصل الالاف في الكميات والاسعار والمبالغ» (المعرّف 18) — بلا قيمة محفوظة تبقى الفواصل ظاهرة. */
export function showThousandsSeparator(): boolean {
  const value = readSetting(18)
  return value === undefined || value === null || value === "" ? true : String(value).toLowerCase() !== "false"
}

/**
 * «الاشارة السالبة للرصيد» (المعرّف 16): credit (افتراضي) = الرصيد الدائن سالب (الرصيد = مدين − دائن)،
 * debit = الرصيد المدين سالب. يُضرب به الرصيد المعروض فقط (لا الحسابات الداخلية) — مثل CRSign في ShamelAPI.
 */
export function balanceDisplaySign(): 1 | -1 {
  return String(readSetting(16) || "credit").toLowerCase() === "debit" ? -1 : 1
}

/** خيارات toLocaleString للمبالغ: نفس عدد الخانات للحد الأدنى والأقصى + فواصل الآلاف حسب الإعداد. */
export function amountFractionOptions(): Intl.NumberFormatOptions {
  const digits = amountDecimals()
  return { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: showThousandsSeparator() }
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
