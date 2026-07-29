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
  JOURNAL_TYPE_COUNTER_ACCOUNT,
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

export const SALES_INVOICE_VCH_TYPE = 16
export const DELIVERY_SELL_VCH_TYPE = 17
export const DELIVERY_CONSIGNMENT_SALE_VCH_TYPE = 18
export const RETURN_DELIVERY_CONSIGNMENT_SALE_VCH_TYPE = 19
export const RETURN_SELL_VCH_TYPE = 20
export const PURCHASE_INVOICE_VCH_TYPE = 21
export const DELIVERY_PAY_VCH_TYPE = 22
export const RETURN_PURCHASE_VCH_TYPE = 23

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

// journal_type_id حسب voucher_journal_type_caption_tbl: 6="المبيعات" و9="المشتريات" (مستخدَمان
// أصلاً لموديولات أخرى محجوزة لم تُبنَ بعد — أول من يستخدمهما فعلياً هو هذا الملف)، و16/17 نوعان
// جديدان لمردود المبيعات/المشتريات (مُضافان في ensureTables أعلاه؛ JOURNAL_TYPE_COUNTER_ACCOUNT=5
// مستورَد من receipts/_lib.ts ويُعاد استخدامه هنا لحساب العميل/المورد المقابل، بمعناه "حساب الزبون/
// المورد" تماماً).
const JOURNAL_TYPE_SALES = 6
// 7="ضريبة المبيعات" و10="ضريبة المشتريات" — محجوزان أصلاً بـvoucher_journal_type_caption_tbl
// (receipts/_lib.ts)، أول استخدام فعلي لهما هنا: سطر قيد حساب الضريبة (تبويب "بيانات اضافية")، لا
// عمود على voucher_header_tbl — نفس نمط SaveVoucher.cs/VoucherJournalDetail.cs المرجعي.
const JOURNAL_TYPE_SALES_TAX = 7
const JOURNAL_TYPE_PURCHASES = 9
const JOURNAL_TYPE_PURCHASE_TAX = 10
const JOURNAL_TYPE_SALES_RETURN = 16
const JOURNAL_TYPE_PURCHASE_RETURN = 17

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
  // الذي تملكه stock-vouchers/_lib.ts وتستخدمه سندات الحركة الأربعة، بما فيها سند الاستعمال) — وليس
  // بجدول منفصل. أعمدته الأساسية (product_id/warehouse_id/quantity/unit_price/batch_number/
  // expiry_date/length-width-height-count/note...) مُنشأة بالفعل عبر ensureStockVoucherTables أعلاه؛
  // الأعمدة التالية فقط خاصة بسندات المبيعات ولا وجود لها هناك، فتُضاف هنا دفاعياً.
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS serial_numbers JSONB DEFAULT '[]'`
  // حساب الصنف (تبويب "تفاصيل حسابات الاصناف" — فاتورة مبيعات/مشتريات ومردود مبيعات/مشتريات فقط،
  // انظر ITEM_ACCOUNT_CONFIG في unified-sales-delivery.tsx وbuildSalesVoucherJournalRows أدناه) —
  // عمود مستقل عن expense_account_id/purchase_account_id الخاصَّين بسند الاستعمال فقط.
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS account_id INTEGER`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS account_cost_centers JSONB DEFAULT '[]'`
  // سند المصدر الذي استُلَّ منه هذا السطر (عرض سعر/طلبية/إرسالية سابقة) — يمنع سحب نفس السطر مرتين
  // عبر نوافذ "استلام من طلبية/إرسالية" في تبويب بيانات اضافية.
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS source_voucher_id INTEGER`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS source_voucher_type INTEGER`

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
  // خصم/ضريبة على مستوى السند كاملاً — نفس نموذج unified-sales-order.tsx (discount_type/discount_value/
  // vat_percent)، بلا تكلفة شحن/رسوم أخرى (غير مطلوبة لهذه الأنواع الثمانية).
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'percentage'`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS vat_percent DOUBLE PRECISION DEFAULT 0`
  // بقية الحقول الجديدة (cash_account_id، vat_classification_id/invoice_type/vat_included/
  // is_maqasa/maqasa_type، phone/due_date/is_exported_sales، location_id) محجوزة أصلاً على
  // voucher_header_tbl من receipts/_lib.ts — بلا ADD COLUMN هنا. حساب الضريبة تحديداً لا يُخزَّن
  // كعمود بالرأس إطلاقاً؛ بل كسطر قيد في voucher_journal_detail_tbl (انظر buildSalesVoucherJournalRows
  // وfetchTaxAccountForVoucher أدناه) مطابقاً لنمط المرجع (SaveVoucher.cs/VoucherJournalDetail.cs).
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
    const response = await fetch(new URL("/api/settings/system", requestUrl))
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
const ITEM_ACCOUNT_JOURNAL_CONFIG: Record<
  number,
  { itemJournalType: number; itemSide: 1 | 2; counterSide: 1 | 2; taxJournalType: number }
> = {
  [SALES_INVOICE_VCH_TYPE]: { itemJournalType: JOURNAL_TYPE_SALES, itemSide: 2, counterSide: 1, taxJournalType: JOURNAL_TYPE_SALES_TAX },
  [RETURN_SELL_VCH_TYPE]: { itemJournalType: JOURNAL_TYPE_SALES_RETURN, itemSide: 1, counterSide: 2, taxJournalType: JOURNAL_TYPE_SALES_TAX },
  [PURCHASE_INVOICE_VCH_TYPE]: { itemJournalType: JOURNAL_TYPE_PURCHASES, itemSide: 1, counterSide: 2, taxJournalType: JOURNAL_TYPE_PURCHASE_TAX },
  [RETURN_PURCHASE_VCH_TYPE]: { itemJournalType: JOURNAL_TYPE_PURCHASE_RETURN, itemSide: 2, counterSide: 1, taxJournalType: JOURNAL_TYPE_PURCHASE_TAX },
}

export const buildSalesVoucherJournalRows = (
  vchType: number,
  items: any[],
  customerAccountId: number | null,
  currencyId: number | null,
  rate: number,
  // حساب الضريبة (تبويب "بيانات اضافية") ومبلغها على مستوى السند كاملاً — لا عمود على
  // voucher_header_tbl، يُسجَّلان هنا كسطر قيد مباشرة (journal_type 7/10 بحسب الاتجاه) بنفس جانب
  // أسطر الصنف (مدين لفاتورة/مردود يُدين الأصناف، دائن للعكس)، ويُضافان لمبلغ الطرف المقابل
  // (العميل/المورد) حتى يبقى القيد متوازناً — مطابق لِـSaveVoucher.cs/VoucherJournalDetail.cs.
  taxAccountId: number | null = null,
  taxAmount = 0,
) => {
  const typeConfig = ITEM_ACCOUNT_JOURNAL_CONFIG[vchType]
  if (!typeConfig || !customerAccountId) return []

  // يُدرَج سطر لكل صنف يحمل حساباً (مطلوب أصلاً لهذه الأنواع الأربعة، انظر validateItemAccounts)
  // حتى لو كان سعره صفراً — القيد يُسجَّل دوماً بمجرد وجود صنف بالسند، لا فقط عند وجود مبلغ فعلي؛
  // خلاف السلوك السابق الذي كان يتجاهل الصنف كلياً (لا سطر إطلاقاً) إن كان سعره صفراً.
  const rows: any[] = []
  let orderNo = 1
  let total = 0
  let hasItemRow = false
  for (const item of items) {
    if (!item.account_id) continue
    const amount = Number(item.total_price || 0)
    rows.push({
      order_no: orderNo++,
      journal_type_id: typeConfig.itemJournalType,
      account_id: Number(item.account_id),
      credit_debit: typeConfig.itemSide,
      amount,
      note: item.product_name || "",
      cost_centers: Array.isArray(item.account_cost_centers) ? item.account_cost_centers : [],
    })
    total += amount
    hasItemRow = true
  }

  const roundedTax = Math.round(Number(taxAmount || 0) * 100) / 100
  if (hasItemRow && taxAccountId && roundedTax > 0) {
    rows.push({
      order_no: orderNo++,
      journal_type_id: typeConfig.taxJournalType,
      account_id: Number(taxAccountId),
      credit_debit: typeConfig.itemSide,
      amount: roundedTax,
      note: "ضريبة",
      cost_centers: [],
    })
  }

  // سطر العميل/المورد المقابل يُدرَج بمجرد وجود سطر صنف واحد على الأقل (حتى لو كان مجموعه صفراً)،
  // لا فقط عند total > 0 كما كان سابقاً — بمبلغ يشمل الضريبة (الطرف المقابل يُطالَب/يُدين بالإجمالي).
  if (hasItemRow) {
    const counterAmount = total + (taxAccountId && roundedTax > 0 ? roundedTax : 0)
    rows.push({
      order_no: orderNo++,
      journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT,
      account_id: Number(customerAccountId),
      credit_debit: typeConfig.counterSide,
      amount: Math.round(counterAmount * 100) / 100,
      note: "حساب الزبون/المورد",
      cost_centers: [],
    })
  }
  return rows.map((row) => ({
    ...row,
    currency_id: currencyId,
    rate,
    base_curr_amount: Math.round(row.amount * rate * 100) / 100,
  }))
}

// يُعيد حساب الضريبة (تبويب "بيانات اضافية") من سطر القيد نفسه بدل عمود على voucher_header_tbl —
// انظر شرح buildSalesVoucherJournalRows أعلاه. journal_type_id يُميِّز بين ضريبة المبيعات (7)
// والمشتريات (10)؛ يكفي البحث عن أيهما لأن سند بعينه من نوع واحد فقط فلن يحمل كليهما معاً.
export const fetchTaxAccountForVoucher = async (
  voucherId: number,
): Promise<{ id: number; code: string; name: string } | null> => {
  const rows = await sql`
    SELECT a.id, a.code, a.name
    FROM voucher_journal_detail_tbl vjd
    JOIN account_tbl a ON a.id = vjd.account_id
    WHERE vjd.voucher_id = ${voucherId} AND vjd.journal_type_id IN (${JOURNAL_TYPE_SALES_TAX}, ${JOURNAL_TYPE_PURCHASE_TAX})
    LIMIT 1
  `
  const row = rows[0]
  return row ? { id: Number(row.id), code: row.code, name: row.name } : null
}

// نفس saveVoucherItems في stock-vouchers/_lib.ts حرفياً (DELETE+إعادة إدراج كاملة، وتصفير تاريخ
// الانتهاء لصنف غير متتبَّع فعلياً عبر NO_EXPIRY_SENTINEL_DATE) — مع أعمدة سندات المبيعات الإضافية
// (serial_numbers/account_id/account_cost_centers/source_voucher_id/source_voucher_type) بدل
// expense_account_id/purchase_account_id/expense_cost_centers/purchase_cost_centers الخاصة بسند
// الاستعمال حصراً.
export const saveSalesVoucherItems = async (voucherId: number, items: any[]) => {
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(items) ? items : []).filter((row) => row?.product_id && Number(row?.quantity || 0) > 0)

  const productIds = [...new Set(rows.map((r) => Number(r.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
  const expiryFlagRows = productIds.length
    ? await sql`SELECT id, has_expiry_date FROM products WHERE id = ANY(${productIds}::int[])`
    : []
  const hasExpiryById = new Map<number, boolean>(
    (expiryFlagRows as any[]).map((r) => [Number(r.id), Boolean(r.has_expiry_date)]),
  )

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const hasExpiry = hasExpiryById.get(Number(row.product_id)) ?? false
    const expiryDateToSave = hasExpiry ? row.expiry_date || null : NO_EXPIRY_SENTINEL_DATE
    await sql`
      INSERT INTO voucher_items_tbl (
        voucher_id, ser, product_id, product_code, product_name, barcode, warehouse_id, unit,
        quantity, bonus_quantity, unit_price, discount_percent, total_price,
        batch_number, expiry_date, serial_numbers, account_id, account_cost_centers,
        source_voucher_id, source_voucher_type, note, length, width, height, count
      ) VALUES (
        ${voucherId}, ${i + 1}, ${row.product_id}, ${row.product_code || ""}, ${row.product_name || ""}, ${row.barcode || ""},
        ${row.warehouse_id || null}, ${row.unit || ""},
        ${Number(row.quantity || 0)}, ${Number(row.bonus_quantity || 0)}, ${Number(row.unit_price || 0)},
        ${Number(row.discount_percent || 0)}, ${Number(row.total_price || 0)},
        ${row.batch_number || null}, ${expiryDateToSave},
        ${JSON.stringify(row.serial_numbers || [])}, ${row.account_id || null}, ${JSON.stringify(row.account_cost_centers || [])},
        ${row.source_voucher_id || null}, ${row.source_voucher_type || null}, ${row.note || ""},
        ${row.length ?? null}, ${row.width ?? null}, ${row.height ?? null}, ${row.count ?? null}
      )
    `
  }
  return rows
}

export const fetchSalesVoucherItems = async (voucherId: number) => {
  // account_code/account_name تُجلَب هنا عبر JOIN (voucher_items_tbl.account_id يخزّن المعرّف فقط)
  // — نفس سبب/إصلاح مشكلة warehouse_name في stock-vouchers/_lib.ts's fetchVoucherItems.
  return sql`
    SELECT vi.*, p.product_code AS current_product_code, p.product_name AS current_product_name,
           w.warehouse_name AS warehouse_name,
           ia.code AS account_code, ia.name AS account_name
    FROM voucher_items_tbl vi
    LEFT JOIN products p ON p.id = vi.product_id
    LEFT JOIN warehouses w ON w.id = vi.warehouse_id
    LEFT JOIN account_tbl ia ON ia.id = vi.account_id
    WHERE vi.voucher_id = ${voucherId}
    ORDER BY vi.ser, vi.id
  `
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

  await reverseSalesVoucherStockMovement(voucherId)
  await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_header_tbl WHERE id = ${voucherId}`

  return {}
}
