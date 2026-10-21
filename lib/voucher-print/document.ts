export type PrintColumn = {
  key: string
  label: string
  align?: "start" | "center" | "end"
  weight?: number
  numeric?: boolean
}

export type PrintCell = string | number | null | undefined

export type PrintDocument = {
  voucherTypeId: number
  title: string
  code: string
  date: string
  copyLabel?: string
  fields?: { label: string; value: PrintCell }[]
  // تفاصيل الشحن — تُطبع في رأس السند فقط إن فُعّل "طباعة تفاصيل الشحن" في إعدادات طباعة نوع السند
  shippingFields?: { label: string; value: PrintCell }[]
  // المشتغل المرخص للعميل — يُجلب تلقائياً عند الطباعة (lib/voucher-print/print.ts) إن فُعّل في إعدادات الطباعة
  partyTaxNumber?: string
  columns: PrintColumn[]
  rows: Record<string, PrintCell>[]
  totals?: { label: string; value: PrintCell; strong?: boolean }[]
  amount?: number
  currencyName?: string
  notes?: string
  // أرشفة السندات: معرّف السند (اختياري — وإلا يُحدَّد بنوعه ورقمه)، وnoAudit لطباعات ليست سنداً (عيّنة/قسائم مطبخ)
  auditVoucherId?: number | null
  // مصدر السجل في أرشفة السندات: الطلبيات في جدول مستقل (orders) — افتراضياً سند
  auditSource?: "voucher" | "order" | "purchase_order"
  noAudit?: boolean
  // نمط سندات القبض/الصرف (مثل الشامل): مربعات معلومات بعنوان بعد حقول الرأس ("تفاصيل الدفع")،
  // المبلغ كتابةً في مربع مستقل ("بالكلمات") بدل أسفل الصفحة، وجداول إضافية بعنوان ("تفاصيل الشيكات"...).
  boxes?: PrintBox[]
  wordsInBox?: boolean
  sections?: PrintSection[]
}

export type PrintBox = { title?: string; items: { label: string; value: PrintCell }[] }
export type PrintSection = { title: string; columns: PrintColumn[]; rows: Record<string, PrintCell>[] }

export type CompanyInfo = {
  name: string
  address: string
  phone: string
  email: string
  taxNumber: string
  logo: string
}

export const formatPrintNumber = (value: PrintCell, digits = 2) => {
  if (value === null || value === undefined || value === "") return ""
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export const cellText = (column: PrintColumn, value: PrintCell) =>
  column.numeric ? formatPrintNumber(value) : value === null || value === undefined ? "" : String(value)

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"]
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]
const HUNDREDS = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"]
const SCALES: [number, string, string, string, string][] = [
  [1_000_000_000, "مليار", "ملياران", "مليارات", "ملياراً"],
  [1_000_000, "مليون", "مليونان", "ملايين", "مليوناً"],
  [1_000, "ألف", "ألفان", "آلاف", "ألفاً"],
]

function underThousand(value: number) {
  const parts: string[] = []
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  if (hundreds) parts.push(HUNDREDS[hundreds])
  if (rest) {
    if (rest < 20) parts.push(ONES[rest])
    else parts.push(rest % 10 ? `${ONES[rest % 10]} و${TENS[Math.floor(rest / 10)]}` : TENS[Math.floor(rest / 10)])
  }
  return parts.join(" و")
}

function integerToArabic(value: number): string {
  if (value === 0) return "صفر"
  const parts: string[] = []
  let rest = value
  for (const [size, one, two, many, accusative] of SCALES) {
    const count = Math.floor(rest / size)
    rest %= size
    if (!count) continue
    if (count === 1) parts.push(one)
    else if (count === 2) parts.push(two)
    else if (count <= 10) parts.push(`${underThousand(count)} ${many}`)
    else parts.push(`${underThousand(count)} ${count % 100 >= 11 ? accusative : one}`)
  }
  if (rest) parts.push(underThousand(rest))
  return parts.join(" و")
}

export function amountInArabicWords(amount: number, currencyName = "") {
  const safe = Math.abs(Number(amount) || 0)
  const whole = Math.floor(safe)
  const fraction = Math.round((safe - whole) * 100)
  const currency = currencyName ? ` ${currencyName}` : ""
  const fractionText = fraction ? ` و${integerToArabic(fraction)} من مائة` : ""
  return `فقط ${integerToArabic(whole)}${currency}${fractionText} لا غير`
}

/** حقول رأس السند للطباعة: بيانات الرأس (إن فُعّلت) + تفاصيل الشحن (إن فُعّل "طباعة تفاصيل الشحن"). */
export function headerPrintFields(document: PrintDocument, settings: { show_fields: boolean; show_shipping_details?: boolean; show_party_tax_number?: boolean }) {
  const filled = (list?: { label: string; value: PrintCell }[]) => (list || []).filter(field => String(field.value ?? "").trim())
  const party = settings.show_party_tax_number && String(document.partyTaxNumber || "").trim()
    ? [{ label: "المشتغل المرخص للعميل", value: String(document.partyTaxNumber).trim() }] : []
  return [...(settings.show_fields ? filled(document.fields) : []), ...party, ...(settings.show_shipping_details ? filled(document.shippingFields) : [])]
}
