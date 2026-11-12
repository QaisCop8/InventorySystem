// عملات العالم لتعريف العملة: اختيار العملة يعبّئ الرمز والاسم والرمز المختصر (مثل ₪ $) والعملة الفرعية وعدد خاناتها —
// العملة الفرعية تلزم للتفقيط (الفواتير وكشوف الحساب ونماذج الحوالات). الأسماء والرموز من Intl، والعملات الفرعية من الجدول.

export type CatalogCurrency = { code: string; name: string; symbol: string; subName: string; fractionDigits: number }

// العملة الفرعية بالعربية (الأكثر استخداماً في المنطقة، ثم الشائعة عالمياً) — غير المذكورة تبقى قابلة للإدخال يدوياً
const SUB_CURRENCY: Record<string, string> = {
  ILS: "أغورة", JOD: "فلس", USD: "سنت", EUR: "سنت", EGP: "قرش", SAR: "هللة", AED: "فلس", KWD: "فلس", QAR: "درهم",
  BHD: "فلس", OMR: "بيسة", IQD: "فلس", LBP: "قرش", SYP: "قرش", YER: "فلس", LYD: "درهم", TND: "مليم", DZD: "سنتيم",
  MAD: "سنتيم", SDG: "قرش", TRY: "قرش", GBP: "بنس", CHF: "سنتيم", CAD: "سنت", AUD: "سنت", CNY: "فين", JPY: "سن",
  INR: "بيسة", RUB: "كوبيك", SEK: "أوره", NOK: "أوره", DKK: "أوره", MRU: "خمس",
}

// عملات المنطقة أولاً
const PREFERRED = ["ILS", "JOD", "USD", "EUR", "EGP", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "IQD", "LBP", "SYP", "TRY", "GBP"]

const FALLBACK_CODES = [
  "AED", "AUD", "BHD", "CAD", "CHF", "CNY", "DKK", "DZD", "EGP", "EUR", "GBP", "ILS", "INR", "IQD", "JOD", "JPY", "KWD", "LBP",
  "LYD", "MAD", "MRU", "NOK", "OMR", "QAR", "RUB", "SAR", "SDG", "SEK", "SYP", "TND", "TRY", "USD", "YER",
]

export function currencyCatalog(lang: "ar" | "en" = "ar"): CatalogCurrency[] {
  let codes: string[] = FALLBACK_CODES
  try {
    const supported = (Intl as any).supportedValuesOf?.("currency")
    if (Array.isArray(supported) && supported.length) codes = supported
  } catch { /* متصفح قديم: القائمة الاحتياطية */ }
  let names: Intl.DisplayNames | null = null
  try { names = new Intl.DisplayNames([lang], { type: "currency" }) } catch { names = null }
  const build = (code: string): CatalogCurrency => {
    let symbol = code
    let fractionDigits = 2
    try {
      // الرمز المختصر من التنسيق الإنجليزي ($ ₪ €) — التنسيق العربي يعطي "US$" ونحوه
      const format = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      symbol = format.formatToParts(0).find((part) => part.type === "currency")?.value || code
      fractionDigits = format.resolvedOptions().maximumFractionDigits ?? 2
    } catch { /* رمز غير معروف للمتصفح */ }
    return { code, name: names?.of(code) || code, symbol, subName: SUB_CURRENCY[code] || "", fractionDigits }
  }
  const collator = new Intl.Collator(lang)
  const preferred = PREFERRED.filter((code) => codes.includes(code)).map(build)
  const rest = codes.filter((code) => !PREFERRED.includes(code)).map(build).sort((a, b) => collator.compare(a.name, b.name))
  return [...preferred, ...rest]
}

export function findCatalogCurrency(code: string, lang: "ar" | "en" = "ar") {
  const wanted = String(code || "").trim().toUpperCase()
  return wanted ? currencyCatalog(lang).find((item) => item.code === wanted) || null : null
}
