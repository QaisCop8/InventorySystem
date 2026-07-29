import sql from "@/lib/database"
import {
  buildVoucherCode,
  nextVoucherSequence,
  resolveVoucherBookName,
  applyStockMovement,
  reverseStockMovement,
  ensureTables as ensureStockVoucherTables,
} from "@/app/api/stock-vouchers/_lib"

// يُعاد تصديرها هنا لأن route.ts/generate-number/resolve-code في هذا المجلد تستوردها من "./_lib"
// (نفس نمط ملفات stock-vouchers) بدل الاستيراد المباشر من وحدة سندات المخزون.
export { buildVoucherCode, nextVoucherSequence, resolveVoucherBookName }

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

  // جدول أسطر مشترك للأنواع الثمانية — أغنى من voucher_items_tbl (سندات الحركة) لأنه يحمل التسعير/
  // الضريبة/الربط العابر للسندات المطلوبة بنطاق الشاشة الأولى (إرسالية مبيعات): بونص، خصم بنسبة
  // ومبلغ، ضريبة، أرقام تسلسلية (JSONB لكل وحدات مسلسلة لنفس السطر)، مراكز كلفة، وربط بسند المصدر
  // (طلبية/عرض سعر) الذي استُلَّ منه هذا السطر.
  await sql`
    CREATE TABLE IF NOT EXISTS sales_voucher_items_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      ser INTEGER,
      product_id INTEGER,
      product_code VARCHAR(50),
      product_name VARCHAR(200),
      barcode VARCHAR(100),
      warehouse_id INTEGER,
      unit VARCHAR(50),
      quantity DOUBLE PRECISION DEFAULT 0,
      bonus_quantity DOUBLE PRECISION DEFAULT 0,
      unit_price DOUBLE PRECISION DEFAULT 0,
      discount_percent DOUBLE PRECISION DEFAULT 0,
      discount_amount DOUBLE PRECISION DEFAULT 0,
      tax_percent DOUBLE PRECISION DEFAULT 0,
      tax_amount DOUBLE PRECISION DEFAULT 0,
      total_price DOUBLE PRECISION DEFAULT 0,
      batch_number VARCHAR(50),
      expiry_date DATE,
      serial_numbers JSONB DEFAULT '[]',
      cost_centers JSONB DEFAULT '[]',
      -- سند المصدر الذي استُلَّ منه هذا السطر (عرض سعر/طلبية/إرسالية سابقة) — يمنع سحب نفس السطر
      -- مرتين عبر نوافذ "استلام من طلبية/إرسالية" في تبويب بيانات اضافية.
      source_voucher_id INTEGER,
      source_voucher_type INTEGER,
      note VARCHAR(200)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_sales_voucher_items_tbl_voucher_id ON sales_voucher_items_tbl(voucher_id)`

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
}

const VOUCHER_CODE_SEQUENCE_DIGITS = 8

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

export const saveSalesVoucherItems = async (voucherId: number, items: any[]) => {
  await sql`DELETE FROM sales_voucher_items_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(items) ? items : []).filter((row) => row?.product_id && Number(row?.quantity || 0) > 0)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    await sql`
      INSERT INTO sales_voucher_items_tbl (
        voucher_id, ser, product_id, product_code, product_name, barcode, warehouse_id, unit,
        quantity, bonus_quantity, unit_price, discount_percent, discount_amount, tax_percent, tax_amount,
        total_price, batch_number, expiry_date, serial_numbers, cost_centers,
        source_voucher_id, source_voucher_type, note
      ) VALUES (
        ${voucherId}, ${i + 1}, ${row.product_id}, ${row.product_code || ""}, ${row.product_name || ""}, ${row.barcode || ""},
        ${row.warehouse_id || null}, ${row.unit || ""},
        ${Number(row.quantity || 0)}, ${Number(row.bonus_quantity || 0)}, ${Number(row.unit_price || 0)},
        ${Number(row.discount_percent || 0)}, ${Number(row.discount_amount || 0)},
        ${Number(row.tax_percent || 0)}, ${Number(row.tax_amount || 0)}, ${Number(row.total_price || 0)},
        ${row.batch_number || null}, ${row.expiry_date || null},
        ${JSON.stringify(row.serial_numbers || [])}, ${JSON.stringify(row.cost_centers || [])},
        ${row.source_voucher_id || null}, ${row.source_voucher_type || null}, ${row.note || ""}
      )
    `
  }
  return rows
}

export const fetchSalesVoucherItems = async (voucherId: number) => {
  return sql`
    SELECT si.*, p.product_code AS current_product_code, p.product_name AS current_product_name,
           w.warehouse_name AS warehouse_name
    FROM sales_voucher_items_tbl si
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN warehouses w ON w.id = si.warehouse_id
    WHERE si.voucher_id = ${voucherId}
    ORDER BY si.ser, si.id
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
  await sql`DELETE FROM sales_voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_header_tbl WHERE id = ${voucherId}`

  return {}
}
