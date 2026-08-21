import sql from "@/lib/database"
import {
  buildVoucherCode,
  nextVoucherSequence,
  resolveVoucherBookName,
  applyStockMovement,
  reverseStockMovement,
  ensureTables as ensureStockVoucherTables,
  NO_EXPIRY_SENTINEL_DATE,
} from "@/app/api/stock-vouchers/_lib"
import {
  ensureTables as ensureReceiptsTables,
  saveJournalRows,
  validateJournalAccountCurrencies,
} from "@/app/api/receipts/_lib"

// يُعاد تصديرها هنا لأن route.ts/generate-number/resolve-code في هذا المجلد تستوردها من "./_lib"
// (نفس نمط ملفات stock-vouchers) بدل الاستيراد المباشر من وحدة سندات المخزون.
export { buildVoucherCode, nextVoucherSequence, resolveVoucherBookName }
export { saveJournalRows, validateJournalAccountCurrencies }

// reference_type مخصَّص لحركات مخزون سندات المبيعات الثمانية (يميّزها في inventory_transactions
// عن سندات المخزون نفسها) — مُمرَّر لِـapplyStockMovement/reverseStockMovement المستوردتين أعلاه
// (عامّتان أصلاً، تقبلان referenceType اختيارياً).
const SALES_VOUCHER_REFERENCE_TYPE = "sales_voucher"

// Shared schema + persistence helpers for the 8 new sales/purchase movement vouchers ported from
// the legacy voucherTypeEnum (Delivery.js): فاتورة مبيعات، إرسالية مبيعات، إرسالية بالعمولة،
// مرتجع إرسالية بالعمولة، مرتجع مبيعات، فاتورة مشتريات، إرسالية مشتريات (دفع)، مرتجع مشتريات.
// IDs 1-2/5/7-15 are already taken in voucher_types_tbl (orders/purchase/invoice/journal/receipt/
// payment/credit-debit-note/stock vouchers) — these 8 use 16-23, matching the recommendation from
// researching voucher_types_tbl's actual live rows (only 7-15 are provably seeded by this repo's
// own code; 1/2/5 are confirmed in-use by components/orders/*, so 16+ is the only safe range).
// Reuses voucher_header_tbl (owned by receipts/_lib.ts) as the header table, same as stock vouchers.

export const SALES_INVOICE_VCH_TYPE = 12
export const DELIVERY_SELL_VCH_TYPE = 13
export const DELIVERY_CONSIGNMENT_SALE_VCH_TYPE = 14
export const RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE = 15
export const RETURN_SELL_VCH_TYPE = 16
export const PURCHASE_INVOICE_VCH_TYPE = 17
export const DELIVERY_PAY_VCH_TYPE = 18
export const RETURN_PURCHASE_VCH_TYPE = 19

export const SALES_VOUCHER_TYPES = [
  SALES_INVOICE_VCH_TYPE,
  DELIVERY_SELL_VCH_TYPE,
  DELIVERY_CONSIGNMENT_SALE_VCH_TYPE,
  RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE,
  RETURN_SELL_VCH_TYPE,
  PURCHASE_INVOICE_VCH_TYPE,
  DELIVERY_PAY_VCH_TYPE,
  RETURN_PURCHASE_VCH_TYPE,
] as const

// أنواع تُخرِج بضاعة من المخزون (مبيعات) مقابل أنواع تُدخِلها (مرتجعات المبيعات ومشتريات) — يحدد
// اتجاه applyStockMovement أدناه. الإرسالية بالعمولة (توريد بضاعة عند وكيل، لم تُبَع فعلياً بعد)
// تُعامَل كإخراج أيضاً (البضاعة تغادر مستودعنا فعلياً)، ومرتجعها كإدخال.
export const SALES_OUT_VCH_TYPES = [SALES_INVOICE_VCH_TYPE, DELIVERY_SELL_VCH_TYPE, DELIVERY_CONSIGNMENT_SALE_VCH_TYPE] as const
export const SALES_IN_VCH_TYPES = [
  RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE,
  RETURN_SELL_VCH_TYPE,
  PURCHASE_INVOICE_VCH_TYPE,
  DELIVERY_PAY_VCH_TYPE,
] as const
// مرتجع مشتريات: بضاعة تعود للمورد، تخرج من مستودعنا.
export const RETURN_PURCHASE_OUT = [RETURN_PURCHASE_VCH_TYPE] as const

// الأنواع الأربعة التي يظهر لها تبويب "تفاصيل حسابات الاصناف" (فاتورة مبيعات/مشتريات ومردود
// مبيعات/مشتريات — وليس أنواع الإرسالية الأربعة الأخرى) — مطابق تماماً لـITEM_ACCOUNT_CONFIG في
// unified-sales-delivery.tsx. يُستخدَم هنا للتحقق من وجود حساب لكل صنف ولبناء قيد buildSalesVoucherJournalRows.
export const ITEM_ACCOUNT_VCH_TYPES = [
  SALES_INVOICE_VCH_TYPE,
  RETURN_SELL_VCH_TYPE,
  PURCHASE_INVOICE_VCH_TYPE,
  RETURN_PURCHASE_VCH_TYPE,
] as const

const JOURNAL_TYPE_SALES_RETURN = 16
const JOURNAL_TYPE_PURCHASE_RETURN = 17

const JOURNAL_TYPE_NAMES: Record<number, { item: string; tax: string }> = {
  [SALES_INVOICE_VCH_TYPE]: { item: "المبيعات", tax: "ضريبة المبيعات" },
  [RETURN_SELL_VCH_TYPE]: { item: "مردود المبيعات", tax: "ضريبة المبيعات" },
  [PURCHASE_INVOICE_VCH_TYPE]: { item: "المشتريات", tax: "ضريبة المشتريات" },
  [RETURN_PURCHASE_VCH_TYPE]: { item: "مردود المشتريات", tax: "ضريبة المشتريات" },
}

export type SalesVoucherJournalTypes = {
  itemJournalType: number
  taxJournalType: number
  counterJournalType: number
  itemSide: 1 | 2
  counterSide: 1 | 2
}

// لا نفترض أن أرقام أنواع القيود ثابتة بين قواعد الشركات. الاسم الدلالي موجود في جدول التسميات،
// والـid الفعلي يُؤخذ من voucher_journal_type_tbl عند كل عملية حفظ/تحميل.
export const resolveSalesVoucherJournalTypes = async (vchType: number): Promise<SalesVoucherJournalTypes | null> => {
  const names = JOURNAL_TYPE_NAMES[vchType]
  if (!names) return null

  const requestedNames = [names.item, names.tax, "حساب الزبون/المورد"]
  const rows = await sql`
    SELECT vjt.id, TRIM(vjtc.name) AS name
    FROM voucher_journal_type_tbl vjt
    JOIN voucher_journal_type_caption_tbl vjtc ON vjtc.journal_type_id = vjt.id
    WHERE vjtc.name = ANY(${requestedNames}::text[])
    ORDER BY CASE WHEN vjtc.language_id = 1 THEN 0 ELSE 1 END, vjtc.id
  `
  const idsByName = new Map<string, number>()
  for (const row of rows) {
    const name = String(row.name || "").trim()
    if (!idsByName.has(name)) idsByName.set(name, Number(row.id))
  }

  const itemJournalType = idsByName.get(names.item)
  const taxJournalType = idsByName.get(names.tax)
  const counterJournalType = idsByName.get("حساب الزبون/المورد")
  if (!itemJournalType || !taxJournalType || !counterJournalType) {
    throw new Error("تعريفات أنواع قيود الفاتورة غير مكتملة في voucher_journal_type_tbl")
  }

  const salesDirection = vchType === SALES_INVOICE_VCH_TYPE || vchType === RETURN_PURCHASE_VCH_TYPE
  return {
    itemJournalType,
    taxJournalType,
    counterJournalType,
    itemSide: salesDirection ? 2 : 1,
    counterSide: salesDirection ? 1 : 2,
  }
}

const VOUCHER_TYPE_NAMES: Record<number, string> = {
  [SALES_INVOICE_VCH_TYPE]: "فاتورة مبيعات",
  [DELIVERY_SELL_VCH_TYPE]: "إرسالية مبيعات",
  [DELIVERY_CONSIGNMENT_SALE_VCH_TYPE]: "إرسالية برسم البيع",
  [RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE]: "مرتجع إرسالية برسم البيع",
  [RETURN_SELL_VCH_TYPE]: "مرتجع مبيعات",
  [PURCHASE_INVOICE_VCH_TYPE]: "فاتورة مشتريات",
  [DELIVERY_PAY_VCH_TYPE]: "إرسالية مشتريات",
  [RETURN_PURCHASE_VCH_TYPE]: "مرتجع مشتريات",
}

export const ensureTables = async () => {
  // voucher_journal_detail_tbl/voucher_journal_type_tbl (تفاصيل حسابات الاصناف لفاتورة مبيعات/
  // مشتريات ومردود مبيعات/مشتريات، انظر buildSalesVoucherJournalRows أدناه) مملوكان أصلاً بواسطة
  // receipts/_lib.ts — نفس نمط credit-notes/_lib.ts (تستدعيها أولاً قبل أي شيء آخر).
  await ensureReceiptsTables()
  // product_stock/inventory_transactions مملوكان فعلياً بواسطة stock-vouchers/_lib.ts — تُستدعى
  // ensureTables هناك هنا أيضاً لضمان وجودهما حتى لو لم تُستخدَم شاشات سندات المخزون إطلاقاً بعد على
  // هذه الشركة (تنصيب جديد قد يبدأ مباشرة بشاشة إرسالية المبيعات دون المرور بها أولاً).
  await ensureStockVoucherTables()

  // voucher_header_tbl/voucher_types_tbl (الجدول الفعلي) مملوكان لـreceipts/_lib.ts وvoucher-book-
  // permissions/_lib.ts على التوالي — فقط صفوف الأنواع الثمانية الجديدة تُضاف هنا، بنفس أسلوب
  // credit-notes/_lib.ts (10/11) وstock-vouchers/_lib.ts (12-15).
  await sql`
    INSERT INTO voucher_types_tbl (id, name, status) VALUES
      (${SALES_INVOICE_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[SALES_INVOICE_VCH_TYPE]}, 1),
      (${DELIVERY_SELL_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[DELIVERY_SELL_VCH_TYPE]}, 1),
      (${DELIVERY_CONSIGNMENT_SALE_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[DELIVERY_CONSIGNMENT_SALE_VCH_TYPE]}, 1),
      (${RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE]}, 1),
      (${RETURN_SELL_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[RETURN_SELL_VCH_TYPE]}, 1),
      (${PURCHASE_INVOICE_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[PURCHASE_INVOICE_VCH_TYPE]}, 1),
      (${DELIVERY_PAY_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[DELIVERY_PAY_VCH_TYPE]}, 1),
      (${RETURN_PURCHASE_VCH_TYPE}, ${VOUCHER_TYPE_NAMES[RETURN_PURCHASE_VCH_TYPE]}, 1)
    ON CONFLICT (id) DO NOTHING
  `

  // أسطر أصناف سندات المبيعات/المشتريات الثمانية تُخزَّن في voucher_items_tbl نفسه (الجدول المشترك
  // الذي تملكه stock-vouchers/_lib.ts وتستخدمه سندات الحركة الأربعة، بما فيها سند الاستعمال) —
  // يتم إنشاء الجدول الجديد يدوياً على المخطط الحديث فقط، ولا تُضاف الأعمدة القديمة/المتوافقية هنا.

  // نوعا قيد إضافيان خاصان بمردود المبيعات/المشتريات (1-15 محجوزة لموديولات أخرى بالفعل، 6="المبيعات"
  // و9="المشتريات" يُعادان استخدامهما هنا لفاتورة مبيعات/مشتريات مباشرة) — نفس نمط إضافة الأنواع
  // الثمانية الجديدة لـvoucher_types_tbl أعلاه.
  await sql`INSERT INTO voucher_journal_type_tbl (id) VALUES (${JOURNAL_TYPE_SALES_RETURN}), (${JOURNAL_TYPE_PURCHASE_RETURN}) ON CONFLICT (id) DO NOTHING`
  await sql`
    INSERT INTO voucher_journal_type_caption_tbl (id, journal_type_id, language_id, name) VALUES
      (${JOURNAL_TYPE_SALES_RETURN}, ${JOURNAL_TYPE_SALES_RETURN}, 1, 'مردود المبيعات'),
      (${JOURNAL_TYPE_PURCHASE_RETURN}, ${JOURNAL_TYPE_PURCHASE_RETURN}, 1, 'مردود المشتريات')
    ON CONFLICT (id) DO NOTHING
  `

  // أعمدة مستوى السند (الرأس) الخاصة بهذه الأنواع الثمانية فقط — تُضاف لـvoucher_header_tbl القائم
  // (لا تُنشئه، receipts/_lib.ts يملك ذلك) دفاعياً بـADD COLUMN IF NOT EXISTS.
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS shipping_address TEXT`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS salesman_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS linked_order_id INTEGER`
  // Drop deprecated header-level source columns — linkage is item-level now.
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS invoice_source_type`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS source_voucher_id`
  await sql`ALTER TABLE voucher_header_tbl DROP COLUMN IF EXISTS source_voucher_type`
  // خصم/ضريبة على مستوى السند كاملاً — نفس نموذج unified-sales-order.tsx (discount_type/discount_value/
  // vat_percent)، بلا تكلفة شحن/رسوم أخرى (غير مطلوبة لهذه الأنواع الثمانية).
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'percentage'`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_percent DOUBLE PRECISION DEFAULT 0`
  // بقية الحقول الجديدة (cash_account_id، vat_classification_id/invoice_type/vat_included/
  // is_maqasa/maqasa_type، phone/due_date/is_exported_sales، location_id) محجوزة أصلاً على
  // voucher_header_tbl من receipts/_lib.ts — بلا ADD COLUMN هنا. حساب الضريبة تحديداً لا يُخزَّن
  // كعمود بالرأس إطلاقاً؛ بل كسطر قيد في voucher_journal_detail_tbl (انظر buildSalesVoucherJournalRows
  // وfetchSalesVoucherJournalAccounts أدناه) مطابقاً لنمط المرجع (SaveVoucher.cs/VoucherJournalDetail.cs).
}

const SALES_VOUCHER_SETTINGS_KEY: Record<number, { prefix: string; start: string; defaultPrefix: string }> = {
  [SALES_INVOICE_VCH_TYPE]: { prefix: "sales_invoice_prefix", start: "sales_invoice_start", defaultPrefix: "INV" },
  [DELIVERY_SELL_VCH_TYPE]: { prefix: "delivery_sell_prefix", start: "delivery_sell_start", defaultPrefix: "DSL" },
  [DELIVERY_CONSIGNMENT_SALE_VCH_TYPE]: { prefix: "delivery_consignment_sale_prefix", start: "delivery_consignment_sale_start", defaultPrefix: "INV" },
  [RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE]: { prefix: "return_delivery_consignment_sale_prefix", start: "return_delivery_consignment_sale_start", defaultPrefix: "INV" },
  [RETURN_SELL_VCH_TYPE]: { prefix: "return_sell_prefix", start: "return_sell_start", defaultPrefix: "INV" },
  [PURCHASE_INVOICE_VCH_TYPE]: { prefix: "purchase_invoice_prefix", start: "purchase_invoice_start", defaultPrefix: "INV" },
  [DELIVERY_PAY_VCH_TYPE]: { prefix: "delivery_pay_prefix", start: "delivery_pay_start", defaultPrefix: "INV" },
  [RETURN_PURCHASE_VCH_TYPE]: { prefix: "return_purchase_prefix", start: "return_purchase_start", defaultPrefix: "INV" },
}

// رقم السند = بادئة (إعدادات النظام) + رمز دفتر السندات + رقم تسلسلي، بنفس منطق
// getStockVoucherNumberSettings في stock-vouchers/_lib.ts.
export const getSalesVoucherNumberSettings = async (
  requestUrl: string,
  vchType: number,
): Promise<{ prefix: string; startNumber: number }> => {
  const key = SALES_VOUCHER_SETTINGS_KEY[vchType]
  const defaultPrefix = key?.defaultPrefix || "SV"
  try {
    const settingsUrl = String(requestUrl || "").trim()
    const response = await fetch(settingsUrl ? new URL("/api/settings/system", settingsUrl) : "/api/settings/system")
    if (!response.ok) return { prefix: defaultPrefix, startNumber: 1 }
    const settings = await response.json()
    const prefixRaw = String(settings?.[key?.prefix || ""] || defaultPrefix).trim().toUpperCase()
    const prefix = /^[A-Z]{1,3}$/.test(prefixRaw) ? prefixRaw : defaultPrefix
    const startNumber = Number(settings?.[key?.start || ""]) || 1
    return { prefix, startNumber }
  } catch (error) {
    console.error("Failed to load sales voucher numbering settings, using defaults:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

export const generateSalesVoucherCode = async (requestUrl: string, vchType: number, vchBookId: number | null): Promise<string> => {
  const bookName = await resolveVoucherBookName(vchBookId)
  const { prefix, startNumber } = await getSalesVoucherNumberSettings(requestUrl, vchType)
  const codePrefix = `${prefix}${bookName}`
  const sequence = await nextVoucherSequence(vchType, codePrefix, startNumber)
  return buildVoucherCode(prefix, bookName, sequence)
}

// يتحقق أن كل صنف بالسند يحمل حساباً — فقط لفاتورة مبيعات/مشتريات ومردود مبيعات/مشتريات (تبويب
// "تفاصيل حسابات الاصناف")؛ خط دفاع ثانٍ خلف نفس التحقق بالواجهة (validateVoucher في
// sales-delivery.tsx) لأي استدعاء مباشر لواجهة الـAPI.
export const validateItemAccounts = (vchType: number, items: any[]): string | null => {
  if (!(ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(vchType)) return null
  const missing = items.some((item) => !item?.account_id)
  if (!missing) return null
  return "رقم حساب الصنف غير محدد يرجى الذهاب الى تاب تفاصيل حسابات الاصناف وتحديد الحساب للاصناف"
}

// سند استعمال في unified-stock-voucher.tsx: قيد كل سطر مغلق بحد ذاته (مدين مصروف/دائن مشتريات
// بنفس المبلغ). هنا يوجد أيضاً عميل/مورد واحد على مستوى السند كاملاً (form.account_id)، فالقيد
// المتوازن هو: مجموع أسطر حساب الصنف (طرف واحد) مقابل سطر واحد للعميل/المورد بإجمالي المبلغ (الطرف
// الآخر) — نفس المعادلة المحاسبية القياسية للفواتير:
//   فاتورة مبيعات: مدين العميل / دائن حساب المبيعات لكل صنف
//   مردود مبيعات: مدين حساب مردود المبيعات لكل صنف / دائن العميل
//   فاتورة مشتريات: مدين حساب المشتريات لكل صنف / دائن المورد
//   مردود مشتريات: مدين المورد / دائن حساب مردود المشتريات لكل صنف
// المبلغ هنا هو total_price الأصلي لكل صنف (كمية × سعر بلا خصم/ضريبة على مستوى السند) — تبسيط
// مقصود (v1) بلا سطري خصم/ضريبة منفصلين، تماماً كما لا يوجد لهما تمثيل في buildUseVoucherJournalRows.
export const buildSalesVoucherJournalRows = (
  vchType: number,
  items: any[],
  counterAccountId: number | null,
  currencyId: number | null,
  rate: number,
  typeConfig: SalesVoucherJournalTypes,
  // حساب الضريبة (تبويب "بيانات اضافية") ومبلغها على مستوى السند كاملاً — لا عمود على
  // voucher_header_tbl، يُسجَّلان هنا كسطر قيد بالنوع المحمّل من جدول أنواع القيود وبنفس جانب
  // أسطر الصنف (مدين لفاتورة/مردود يُدين الأصناف، دائن للعكس)، ويُضافان لمبلغ الطرف المقابل
  // (العميل/المورد) حتى يبقى القيد متوازناً — مطابق لِـSaveVoucher.cs/VoucherJournalDetail.cs.
  taxAccountId: number | null = null,
  taxAmount = 0,
) => {
  if (!typeConfig || !counterAccountId) return []

  // يُدرَج سطر لكل صنف يحمل حساباً (مطلوب أصلاً لهذه الأنواع الأربعة، انظر validateItemAccounts)
  // حتى لو كان سعره صفراً — القيد يُسجَّل دوماً بمجرد وجود صنف بالسند، لا فقط عند وجود مبلغ فعلي؛
  // خلاف السلوك السابق الذي كان يتجاهل الصنف كلياً (لا سطر إطلاقاً) إن كان سعره صفراً.
  const itemRows: any[] = []
  let total = 0
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex]
    if (!item.account_id) continue
    const amount = Number(item.total_price || 0)
    itemRows.push({
      journal_type_id: typeConfig.itemJournalType,
      account_id: Number(item.account_id),
      credit_debit: typeConfig.itemSide,
      amount,
      note: item.product_name || "",
      cost_centers: Array.isArray(item.account_cost_centers) ? item.account_cost_centers : [],
      item_index: itemIndex,
    })
    total += amount
  }

  const hasItemRow = itemRows.length > 0
  const roundedTax = Math.round(Number(taxAmount || 0) * 100) / 100
  const rows: any[] = []
  if (hasItemRow) {
    const counterAmount = total + (taxAccountId && roundedTax > 0 ? roundedTax : 0)
    rows.push({
      order_no: 1,
      journal_type_id: typeConfig.counterJournalType,
      account_id: Number(counterAccountId),
      credit_debit: typeConfig.counterSide,
      amount: Math.round(counterAmount * 100) / 100,
      note: "حساب الزبون/المورد",
      cost_centers: [],
    })
  }

  if (hasItemRow && taxAccountId && roundedTax > 0) {
    rows.push({
      order_no: 2,
      journal_type_id: typeConfig.taxJournalType,
      account_id: Number(taxAccountId),
      credit_debit: typeConfig.itemSide,
      amount: roundedTax,
      note: "ضريبة",
      cost_centers: [],
    })
  }

  // ترتيب السطور مطابق للنظام المرجعي: المقابل 1، الضريبة 2، ثم حسابات الأصناف من 3.
  for (let index = 0; index < itemRows.length; index++) {
    rows.push({ ...itemRows[index], order_no: index + 3 })
  }
  return rows.map((row) => ({
    ...row,
    currency_id: currencyId,
    rate,
    base_curr_amount: Math.round(row.amount * rate * 100) / 100,
  }))
}

// يعيد حسابي الضريبة والصندوق من أسطر القيد نفسها بدل الاعتماد على رأس السند. أرقام الأنواع
// تُحل ديناميكياً من voucher_journal_type_tbl، مع fallback بالملاحظة للسجلات القديمة.
export const fetchSalesVoucherJournalAccounts = async (voucherId: number, vchType: number, hasCustomerAccount: boolean) => {
  const typeConfig = await resolveSalesVoucherJournalTypes(vchType)
  if (!typeConfig) return { taxAccount: null, cashAccount: null }
  const rows = await sql`
    SELECT vjd.journal_type_id, vjd.note, a.id, a.code, a.name
    FROM voucher_journal_detail_tbl vjd
    JOIN account_tbl a ON a.id = vjd.account_id
    WHERE vjd.voucher_id = ${voucherId}
      AND (
        vjd.journal_type_id IN (${typeConfig.taxJournalType}, ${typeConfig.counterJournalType})
        OR COALESCE(vjd.note, '') IN ('ضريبة', 'حساب الزبون/المورد')
      )
    ORDER BY vjd.order_no
  `
  const toAccount = (row: any) => row ? { id: Number(row.id), code: row.code, name: row.name } : null
  return {
    taxAccount: toAccount(rows.find((row: any) => Number(row.journal_type_id) === typeConfig.taxJournalType || row.note === "ضريبة")),
    cashAccount: hasCustomerAccount
      ? null
      : toAccount(rows.find((row: any) => Number(row.journal_type_id) === typeConfig.counterJournalType || row.note === "حساب الزبون/المورد")),
  }
}

// نفس saveVoucherItems في stock-vouchers/_lib.ts حرفياً (DELETE+إعادة إدراج كاملة، وتصفير تاريخ
// الانتهاء لصنف غير متتبَّع فعلياً عبر NO_EXPIRY_SENTINEL_DATE) — مع أعمدة سندات المبيعات الإضافية
// (serial_numbers/account_id/account_cost_centers/source_voucher_id/source_voucher_type) بدل
// expense_account_id/purchase_account_id/expense_cost_centers/purchase_cost_centers الخاصة بسند
// الاستعمال حصراً.
export const saveSalesVoucherItems = async (voucherId: number, items: any[]) => {
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
  await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
  await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
  await sql`CREATE TABLE IF NOT EXISTS voucher_item_attributes_tbl (id BIGSERIAL PRIMARY KEY, voucher_item_id INTEGER NOT NULL REFERENCES voucher_items_tbl(id) ON DELETE CASCADE, product_attribute_value_id BIGINT NOT NULL REFERENCES product_atrributes_values_tbl(id) ON DELETE CASCADE, UNIQUE(voucher_item_id, product_attribute_value_id))`
  await sql`CREATE TABLE IF NOT EXISTS order_item_attributes_tbl (id BIGSERIAL PRIMARY KEY, order_item_id INTEGER NOT NULL, product_attribute_value_id BIGINT NOT NULL REFERENCES product_atrributes_values_tbl(id) ON DELETE CASCADE, UNIQUE(order_item_id, product_attribute_value_id))`
  const rows = (Array.isArray(items) ? items : []).filter((row) => row?.product_id && Number(row?.quantity || 0) > 0)

  const productIds = [...new Set(rows.map((r) => Number(r.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
  const expiryFlagRows = productIds.length
    ? await sql`SELECT id, has_expiry_date FROM products WHERE id = ANY(${productIds}::int[])`
    : []
  const hasExpiryById = new Map<number, boolean>(
    (expiryFlagRows as any[]).map((r) => [Number(r.id), Boolean(r.has_expiry_date)]),
  )

  const unitNames = [...new Set(rows.map((r) => String(r.unit || r.unit_name || "").trim()).filter(Boolean))]
  const unitRows = unitNames.length
    ? await sql`SELECT id, unit_name FROM units WHERE LOWER(TRIM(unit_name)) = ANY(${unitNames.map((name) => name.toLowerCase())}::text[])`
    : []
  const unitIdsByName = new Map<string, number>(
    (unitRows as any[]).map((r) => [String(r.unit_name).trim().toLowerCase(), Number(r.id)]),
  )

  const savedRows: any[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const unitName = String(row.unit || row.unit_name || "").trim()
    const rawUnitId = row.unit_id ?? row.unitId ?? null
    const resolvedUnitId = Number(rawUnitId ?? null) > 0 ? Number(rawUnitId) : unitName ? unitIdsByName.get(unitName.toLowerCase()) ?? null : null
    const hasExpiry = hasExpiryById.get(Number(row.product_id)) ?? false
    const expiryDateToSave = hasExpiry ? row.expiry_date || null : NO_EXPIRY_SENTINEL_DATE
    const inserted = await sql`
      INSERT INTO voucher_items_tbl (
        voucher_id, item_id, item_name, unit_id, qnty, bonus, discount, vat_classification_id,
        vat_amount, vat_ratio, price, note, cost_price, barcode, size_id, color_taste_id,
        length, width, height, count, order_item_id, delivery_item_id, production_date,
        expiry_date, batch_no, store_id, journal_id, return_sales_invoice_id
      ) VALUES (
        ${voucherId},
        ${row.item_id ?? row.product_id ?? null},
        ${row.item_name || row.product_name || ""},
        ${resolvedUnitId ?? null},
        ${Number(row.qnty ?? row.quantity ?? 0)},
        ${Number(row.bonus ?? row.bonus_quantity ?? 0)},
        ${Number(row.discount ?? row.discount_percent ?? 0)},
        ${row.vat_classification_id ?? null},
        ${Number(row.vat_amount ?? 0)},
        ${Number(row.vat_ratio ?? 0)},
        ${Number(row.price ?? row.unit_price ?? 0)},
        ${row.note || ""},
        ${Number(row.cost_price ?? 0)},
        ${row.barcode || ""},
        ${row.size_id ?? null},
        ${row.color_taste_id ?? null},
        ${row.length ?? null},
        ${row.width ?? null},
        ${row.height ?? null},
        ${row.count ?? null},
        ${row.order_item_id ?? null},
        ${row.delivery_item_id ?? null},
        ${row.production_date || null},
        ${expiryDateToSave},
        ${row.batch_no || row.batch_number || null},
        ${row.store_id ?? row.warehouse_id ?? null},
        ${row.journal_id ?? null},
        ${row.return_sales_invoice_id ?? null}
      ) RETURNING id
    `
    savedRows.push({ ...row, id: Number(inserted[0].id) })
    const selected = row.selected_attributes && typeof row.selected_attributes === "object" ? Object.values(row.selected_attributes).map(String) : []
    for (const value of selected) {
      await sql`INSERT INTO voucher_item_attributes_tbl (voucher_item_id, product_attribute_value_id)
        SELECT ${inserted[0].id}, pav.id FROM product_atrributes_values_tbl pav JOIN attribute_values_tbl av ON av.id = pav.value_id
        WHERE pav.product_id = ${Number(row.product_id)} AND av.name = ${value}
        ON CONFLICT DO NOTHING`
      if (row.order_item_id) await sql`INSERT INTO order_item_attributes_tbl (order_item_id, product_attribute_value_id)
        SELECT ${Number(row.order_item_id)}, pav.id FROM product_atrributes_values_tbl pav JOIN attribute_values_tbl av ON av.id = pav.value_id
        WHERE pav.product_id = ${Number(row.product_id)} AND av.name = ${value}
        ON CONFLICT DO NOTHING`
    }
  }
  return savedRows
}

export const linkSalesVoucherItemsToJournals = async (savedItems: any[], journalRows: any[], journalIds: number[]) => {
  for (let journalIndex = 0; journalIndex < journalRows.length; journalIndex++) {
    const itemIndex = journalRows[journalIndex]?.item_index
    const itemId = itemIndex != null ? savedItems[Number(itemIndex)]?.id : null
    const journalId = journalIds[journalIndex]
    if (!itemId || !journalId) continue
    await sql`UPDATE voucher_items_tbl SET journal_id = ${journalId} WHERE id = ${itemId}`
  }
}

export const fetchSalesVoucherItems = async (voucherId: number, itemJournalTypeId?: number | null) => {
  const rows = await sql`
    WITH numbered_items AS (
      SELECT vi.*, ROW_NUMBER() OVER (ORDER BY vi.id) AS item_row_no
      FROM voucher_items_tbl vi
      WHERE vi.voucher_id = ${voucherId}
    ), numbered_journals AS (
      SELECT vjd.*, ROW_NUMBER() OVER (ORDER BY vjd.order_no, vjd.id) AS journal_row_no
      FROM voucher_journal_detail_tbl vjd
      WHERE vjd.voucher_id = ${voucherId}
        AND (
          vjd.journal_type_id = ${itemJournalTypeId ?? -1}
          OR COALESCE(vjd.note, '') NOT IN ('ضريبة', 'حساب الزبون/المورد')
        )
    )
    SELECT
      vi.id,
      vi.voucher_id,
      vi.item_id AS product_id,
      vi.item_id AS item_id,
      vi.item_name,
      vi.unit_id,
      u.unit_name AS unit_name,
      u.unit_name AS unit,
      vi.qnty AS quantity,
      vi.bonus AS bonus_quantity,
      vi.discount AS discount_percent,
      vi.vat_classification_id,
      vi.vat_amount,
      vi.vat_ratio,
      vi.price AS unit_price,
      vi.price AS price,
      vi.note,
      vi.cost_price,
      vi.barcode,
      vi.size_id,
      vi.color_taste_id,
      vi.length,
      vi.width,
      vi.height,
      vi.count,
      vi.order_item_id,
      vi.delivery_item_id,
      source_delivery_header.id AS source_voucher_id,
      source_delivery_header.vch_type AS source_voucher_type,
      source_delivery_header.vch_code AS source_voucher_code,
      vi.production_date,
      vi.expiry_date,
      vi.batch_no AS batch_number,
      vi.store_id AS warehouse_id,
      vi.store_id AS store_id,
      COALESCE(linked_journal.id, fallback_journal.id) AS journal_id,
      account.id AS account_id,
      COALESCE(account.code, '') AS account_code,
      COALESCE(account.name, '') AS account_name,
      COALESCE((
        SELECT json_agg(json_build_object(
          'cost_center_type_id', cc.cost_type_id,
          'cost_center_id', cc.id,
          'cost_center_name', cc.name
        ) ORDER BY cc.cost_type_id, cc.id)
        FROM voucher_costcenter_tbl vc
        JOIN cost_centers cc ON cc.id = vc.cost_center_id
        WHERE vc.voucher_journal_id = COALESCE(linked_journal.id, fallback_journal.id)
      ), '[]'::json) AS account_cost_centers,
      vi.return_sales_invoice_id,
      COALESCE(p.product_code, '') AS product_code,
      p.product_code AS current_product_code,
      COALESCE(p.product_name, vi.item_name, '') AS product_name,
      p.product_name AS current_product_name,
      COALESCE(u.unit_name, '') AS unit,
      COALESCE(u.unit_name, '') AS unit_name,
      w.warehouse_name AS warehouse_name,
      (vi.qnty * vi.price * (1 - vi.discount / 100)) AS total_price,
      (vi.qnty * vi.price * (1 - vi.discount / 100)) AS amount,
      (vi.qnty * vi.price * (1 - vi.discount / 100)) AS line_amount
    FROM numbered_items vi
    LEFT JOIN voucher_journal_detail_tbl linked_journal ON linked_journal.id = vi.journal_id
    LEFT JOIN numbered_journals fallback_journal
      ON vi.journal_id IS NULL AND fallback_journal.journal_row_no = vi.item_row_no
    LEFT JOIN account_tbl account ON account.id = COALESCE(linked_journal.account_id, fallback_journal.account_id)
    LEFT JOIN products p ON p.id = vi.item_id
    LEFT JOIN units u ON u.id = vi.unit_id
    LEFT JOIN warehouses w ON w.id = vi.store_id
    LEFT JOIN voucher_items_tbl source_delivery_item ON source_delivery_item.id = vi.delivery_item_id
    LEFT JOIN voucher_header_tbl source_delivery_header ON source_delivery_header.id = source_delivery_item.voucher_id
    WHERE vi.voucher_id = ${voucherId}
    ORDER BY vi.id
  `

  const itemIds = (rows as any[]).map((row) => Number(row.id)).filter((id) => id > 0)
  if (itemIds.length === 0) return rows
  const attributeRows = await sql`
    SELECT
      vi.id AS voucher_item_id,
      a.name AS attribute_name,
      av.name AS value_name,
      pav.image_url,
      via.id IS NOT NULL AS is_selected
    FROM voucher_items_tbl vi
    JOIN product_atrributes_values_tbl pav ON pav.product_id = vi.item_id
    JOIN attributes_tbl a ON a.id = pav.attr_id
    JOIN attribute_values_tbl av ON av.id = pav.value_id
    LEFT JOIN voucher_item_attributes_tbl via
      ON via.voucher_item_id = vi.id
     AND via.product_attribute_value_id = pav.id
    WHERE vi.id = ANY(${itemIds}::bigint[])
    ORDER BY vi.id, a.name, av.name
  `
  const byItem = new Map<number, { attributes: any[]; selected: Record<string, string> }>()
  for (const row of attributeRows as any[]) {
    const itemId = Number(row.voucher_item_id)
    let entry = byItem.get(itemId)
    if (!entry) {
      entry = { attributes: [], selected: {} }
      byItem.set(itemId, entry)
    }
    let attribute = entry.attributes.find((candidate) => candidate.name === row.attribute_name)
    if (!attribute) {
      attribute = { name: row.attribute_name, values: [], value_images: {} }
      entry.attributes.push(attribute)
    }
    attribute.values.push(row.value_name)
    if (row.image_url) attribute.value_images[row.value_name] = row.image_url
    if (row.is_selected) entry.selected[row.attribute_name] = row.value_name
  }
  return (rows as any[]).map((row) => {
    const entry = byItem.get(Number(row.id))
    return entry ? { ...row, attributes: entry.attributes, selected_attributes: entry.selected } : row
  })
}

// اتجاه حركة المخزون لكل نوع — يُستخدَم مع applyStockMovement/reverseStockMovement المستوردتين من
// stock-vouchers/_lib.ts (عامّتان أصلاً: تأخذان items[] + direction + referenceId بمعزل عن نوع
// السند)، فتُسجَّل حركة إرسالية المبيعات بنفس دفتر product_stock/inventory_transactions المستخدَم
// لسندات الحركة، بـreference_type مختلف ('sales_voucher') للتمييز عند التتبع/العكس.
export const resolveStockDirection = (vchType: number): "in" | "out" | null => {
  if ((SALES_OUT_VCH_TYPES as readonly number[]).includes(vchType)) return "out"
  if ((SALES_IN_VCH_TYPES as readonly number[]).includes(vchType)) return "in"
  if ((RETURN_PURCHASE_OUT as readonly number[]).includes(vchType)) return "out"
  return null
}

// تُطبَّق فقط عند status=2 (مرحّل) — مسودة لا تحرّك المخزون، مطابقاً لِـapplyVoucherStockEffect
// في stock-vouchers/_lib.ts.
export const applySalesVoucherStockEffect = async (vchType: number, voucherId: number, items: any[]) => {
  const direction = resolveStockDirection(vchType)
  if (!direction) return
  await applyStockMovement(items, direction, voucherId, null, 1, SALES_VOUCHER_REFERENCE_TYPE)
}

export const reverseSalesVoucherStockMovement = async (voucherId: number) => {
  await reverseStockMovement(voucherId, 1, SALES_VOUCHER_REFERENCE_TYPE)
}

export const archiveAndDeleteSalesVoucher = async (voucherId: number): Promise<{ error?: string }> => {
  const headerRows = await sql`SELECT * FROM voucher_header_tbl WHERE id = ${voucherId}`
  if (headerRows.length === 0) return { error: "السند غير موجود" }
  const voucher = headerRows[0]
  if (Number(voucher.status) !== 1) {
    return { error: "لا يمكن الحذف الفعلي إلا لسند بحالة فعال (غير مرحّل)" }
  }

  const linkedInvoiceByItem = await sql`
    SELECT inv.id
    FROM voucher_items_tbl inv_item
    JOIN voucher_header_tbl inv ON inv.id = inv_item.voucher_id
    WHERE inv.vch_type IN (${SALES_INVOICE_VCH_TYPE}, ${PURCHASE_INVOICE_VCH_TYPE})
      AND inv_item.delivery_item_id IN (
        SELECT id FROM voucher_items_tbl WHERE voucher_id = ${voucherId}
      )
    LIMIT 1
  `

  if (linkedInvoiceByItem.length > 0) {
    return { error: "لا يمكن حذف هذه الإرسالية لأنها مرتبطة بفاتورة" }
  }

  await reverseSalesVoucherStockMovement(voucherId)
  await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_header_tbl WHERE id = ${voucherId}`

  return {}
}
