// منطق بناء/تفكيك رقم السند (vch_code) المشترك بين كل أنواع السندات — سند قبض/صرف، سند قيد،
// سندات المخزون (ادخال/اخراج/ارسالية داخلية/استعمال)، إرسالية المبيعات وباقي سندات المبيعات،
// ومذكرات الإشعار (دائن/مدين). كان هذا المنطق مكرَّراً حرفياً في 3 ملفات (_lib.ts لكل من
// receipts وjournal-vouchers وstock-vouchers)، فكان أي تعديل على قاعدة الترقيم يحتاج تعديل 3
// نسخ متطابقة. مجمَّع هنا في مكان واحد فقط.

// الطول الإجمالي لكود السند لا يتجاوز 10 خانات مهما كان طول البادئة/رمز الدفتر، بدل الاعتماد
// على 8 خانات ثابتة للتسلسل (التي كانت تجعل الطول الكلي يتجاوز 10 عند أي بادئة/دفتر بحرف واحد).
export const VOUCHER_CODE_TOTAL_LENGTH = 10

// رموز الفرع المتاحة (حرف واحد) بترتيب العرض: 0 ثم A..Z
export const BRANCH_SYMBOLS = "0ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

export const normalizeVoucherPrefix =(value: string): string =>
  String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1)

// كود السند = بادئة السند (حسب نوعه، من إعدادات النظام) + رمز دفتر السندات + بادئة مستخدم
// اختيارية بحرف واحد + رقم تسلسلي مبطّن بأصفار — بمجموع أحرف لا يتجاوز 10 دوماً. عدد خانات
// التسلسل يتقلّص ديناميكياً بحسب طول الأجزاء الأخرى بدل عدد ثابت (8) كما كان سابقاً.
export const buildVoucherCode = (prefix: string, bookName: string, sequence: number, userPrefix = ""): string => {
  const basePrefix = String(prefix || "").trim().toUpperCase()
  const normalizedBookName = String(bookName || "").trim().toUpperCase()
  const normalizedUserPrefix = normalizeVoucherPrefix(userPrefix)

  const fixedLength = basePrefix.length + normalizedBookName.length + normalizedUserPrefix.length
  const sequenceDigits = Math.max(1, VOUCHER_CODE_TOTAL_LENGTH - fixedLength)
  const sequencePart = String(sequence).padStart(sequenceDigits, "0").slice(-sequenceDigits)

  const code = `${basePrefix}${normalizedBookName}${normalizedUserPrefix}${sequencePart}`
  return code.length > VOUCHER_CODE_TOTAL_LENGTH ? code.slice(0, VOUCHER_CODE_TOTAL_LENGTH) : code
}

// يفكّك ما يكتبه المستخدم في خانة رقم السند عند الخروج منها (blur) إلى (بادئة مستخدم اختيارية + رقم تسلسلي)
// بعد نزع الجزء الرئيسي إن كان مكتوباً: بادئة السند + (رمز الفرع + رمز الدفتر). يُعاد null إن لم يكن النص
// بصيغة صالحة. الجزء الرئيسي يُعاد بناؤه دوماً من الإعدادات والفرع والدفتر الحاليين لا مما كُتب، فتغيّر الفرع
// يغيّر الكود حتى لو كان المكتوب كوداً كاملاً لفرع سابق.
export const parseTypedVoucherCode = (
  raw: string,
  configuredPrefix: string,
  codeSegment: string,
  branchSymbol = "",
): { userPrefix: string; sequence: number } | null => {
  let text = String(raw || "").trim().toUpperCase()
  const prefix = String(configuredPrefix || "").trim().toUpperCase()
  const segment = String(codeSegment || "").trim().toUpperCase()
  const symbol = String(branchSymbol || "").trim().toUpperCase()
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length)
  // كود كامل لفرع آخر (نفس الدفتر برمز فرع مختلف): يُنزع رمز الفرع القديم مع الدفتر ليُستبدل برمز الفرع الحالي
  const bareBook = symbol ? segment.slice(symbol.length) : ""
  if (symbol && bareBook && !text.startsWith(segment) && BRANCH_SYMBOLS.includes(text.charAt(0)) && text.slice(1).startsWith(bareBook)) {
    text = text.slice(1 + bareBook.length)
  }
  while (segment && text.startsWith(segment)) text = text.slice(segment.length)
  const match = text.match(/^([A-Z]*)(\d+)$/)
  if (!match) return null
  return { userPrefix: match[1].slice(0, 1), sequence: Number(match[2]) }
}

// يفكّك ما يكتبه المستخدم يدوياً في خانة رقم السند إلى (بادئة مستخدم اختيارية بحرف واحد + رقم
// تسلسلي)، مع تجاهل أي شيء آخر كتبه (بما فيه بادئة سند/دفتر خاطئة) — فالجزء الرئيسي
// (بادئة السند + رمز الدفتر) يُعاد بناؤه دوماً من الإعدادات الحالية والدفتر المختار، لا مما كتبه
// المستخدم. مثال: كتابة "02" (بادئة B، دفتر A) تُبنى B+A+...00000002؛ كتابة "A1" تُبنى
// B+A+A...0000001 (A هنا تُقرأ كبادئة مستخدم، و1 كبذرة الرقم التسلسلي).
export const parseVoucherCodeInput = (typed: string): { userPrefix: string; sequence: number } => {
  const cleaned = String(typed || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")

  // الرقم التسلسلي = سلسلة الأرقام في نهاية ما كتبه المستخدم (إن وُجدت)؛ وبادئة المستخدم
  // الاختيارية = الحرف الأخير مباشرة قبل تلك الأرقام إن وُجد — أي شيء آخر قبله (بادئة/دفتر
  // خاطئ كتبه المستخدم، أو حتى كود كامل بطول 10 خانات) يُتجاهل عمداً لأن الجزء الرئيسي يُعاد
  // بناؤه دوماً من الإعدادات الحالية لا مما كُتب.
  const digitsMatch = cleaned.match(/([0-9]+)$/)
  const digits = digitsMatch ? digitsMatch[1] : ""
  const beforeDigits = digits ? cleaned.slice(0, cleaned.length - digits.length) : cleaned

  return {
    userPrefix: beforeDigits.slice(-1),
    sequence: digits ? Number(digits) : 0,
  }
}
