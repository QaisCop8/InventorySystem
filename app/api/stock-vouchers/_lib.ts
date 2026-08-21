import sql from "@/lib/database"
import { buildVoucherCode, normalizeVoucherPrefix } from "@/lib/voucher-code"

export { buildVoucherCode, normalizeVoucherPrefix }

// Shared schema + persistence helpers for the 4 new item-quantity vouchers:
// سند ادخال بضاعة (Stock In), سند اخراج بضاعة (Stock Out), ارسالية داخلية (Internal Delivery),
// سند استعمال (Use Voucher). All four share voucher_header_tbl (from app/api/receipts/_lib.ts)
// as their header table, plus a new voucher_items_tbl child table for item lines. Used by
// route.ts, [id]/route.ts and navigation/[navigationType]/route.ts.

export const STOCK_IN_VCH_TYPE = 8
export const STOCK_OUT_VCH_TYPE = 9
export const INTERNAL_DELIVERY_VCH_TYPE = 10
export const USE_VOUCHER_VCH_TYPE = 11

export const STOCK_VOUCHER_TYPES = [
  STOCK_IN_VCH_TYPE,
  STOCK_OUT_VCH_TYPE,
  INTERNAL_DELIVERY_VCH_TYPE,
  USE_VOUCHER_VCH_TYPE,
] as const

export const ensureTables = async () => {
  // voucher_header_tbl/voucher_types_tbl (the real one, migrated from legacy voucher_types)
  // are owned by receipts/_lib.ts and voucher-book-permissions/_lib.ts respectively — only the
  // 4 new type rows are inserted here, matching how credit-notes/_lib.ts adds 10/11.
  await sql`
    INSERT INTO voucher_types_tbl (id, name, status) VALUES
      (${STOCK_IN_VCH_TYPE}, 'سند ادخال بضاعة', 1),
      (${STOCK_OUT_VCH_TYPE}, 'سند اخراج بضاعة', 1),
      (${INTERNAL_DELIVERY_VCH_TYPE}, 'ارسالية داخلية', 1),
      (${USE_VOUCHER_VCH_TYPE}, 'سند استعمال', 1)
    ON CONFLICT (id) DO NOTHING
  `

  // to_store_id already exists on voucher_header_tbl (reserved column, unused until now) —
  // reused here as the primary/destination warehouse. from_store_id is new: only Internal
  // Delivery uses it (source warehouse of the transfer).
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS from_store_id INTEGER`

  await sql`
    CREATE TABLE IF NOT EXISTS voucher_items_tbl (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
      item_id INTEGER,
      item_name VARCHAR(140),
      unit_id INTEGER,
      qnty DOUBLE PRECISION,
      bonus DOUBLE PRECISION,
      discount DOUBLE PRECISION,
      vat_classification_id INTEGER,
      vat_amount DOUBLE PRECISION,
      vat_ratio DOUBLE PRECISION,
      price DOUBLE PRECISION,
      note VARCHAR(200),
      cost_price DOUBLE PRECISION,
      barcode VARCHAR(150),
      size_id INTEGER,
      color_taste_id INTEGER,
      length INTEGER,
      width INTEGER,
      height INTEGER,
      count INTEGER,
      order_item_id INTEGER,
      delivery_item_id INTEGER,
      production_date DATE,
      expiry_date DATE,
      batch_no VARCHAR(30),
      store_id INTEGER,
      journal_id INTEGER,
      return_sales_invoice_id INTEGER
    )
  `
  await sql`ALTER TABLE voucher_items_tbl DROP COLUMN IF EXISTS expense_account_id`
  await sql`ALTER TABLE voucher_items_tbl DROP COLUMN IF EXISTS purchase_account_id`
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_items_tbl_voucher_id ON voucher_items_tbl(voucher_id)`
  await sql`CREATE TABLE IF NOT EXISTS attributes_tbl (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`
  await sql`CREATE TABLE IF NOT EXISTS attribute_values_tbl (id SERIAL PRIMARY KEY, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(attr_id, name))`
  await sql`CREATE TABLE IF NOT EXISTS product_atrributes_values_tbl (id BIGSERIAL UNIQUE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, attr_id INTEGER NOT NULL REFERENCES attributes_tbl(id) ON DELETE CASCADE, value_id INTEGER NOT NULL REFERENCES attribute_values_tbl(id) ON DELETE CASCADE, image_url TEXT, PRIMARY KEY(product_id, attr_id, value_id))`
  await sql`CREATE TABLE IF NOT EXISTS voucher_item_attributes_tbl (id BIGSERIAL PRIMARY KEY, voucher_item_id INTEGER NOT NULL REFERENCES voucher_items_tbl(id) ON DELETE CASCADE, product_attribute_value_id BIGINT NOT NULL REFERENCES product_atrributes_values_tbl(id) ON DELETE CASCADE, UNIQUE(voucher_item_id, product_attribute_value_id))`
  await sql`CREATE TABLE IF NOT EXISTS order_item_attributes_tbl (id BIGSERIAL PRIMARY KEY, order_item_id INTEGER NOT NULL, product_attribute_value_id BIGINT NOT NULL REFERENCES product_atrributes_values_tbl(id) ON DELETE CASCADE, UNIQUE(order_item_id, product_attribute_value_id))`

  // product_stock already exists in this DB (created by an earlier, separate migration) but is
  // re-declared IF NOT EXISTS here defensively, matching this codebase's convention of never
  // assuming another module's table already ran on a fresh install. القيد الفريد على product_id
  // وحده (لا product_id+organization_id) عمداً — يطابق القيد الفعلي الموجود على الجدول الحي
  // (product_stock_product_id_key)، وorganization_id ثابت دائماً على 1 في كل هذا الكود فلا فائدة
  // من تضمينه في التفرّد أصلاً؛ استخدام قيد مركّب هنا كان يجعل ON CONFLICT في applyStockMovement
  // يفشل بخطأ Postgres صريح (لا قيد مطابق) عند كل عملية ترحيل.
  await sql`
    CREATE TABLE IF NOT EXISTS product_stock (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL UNIQUE,
      organization_id INTEGER DEFAULT 1,
      current_stock DOUBLE PRECISION DEFAULT 0,
      available_stock DOUBLE PRECISION DEFAULT 0,
      reserved_stock DOUBLE PRECISION DEFAULT 0,
      reorder_level DOUBLE PRECISION,
      max_stock_level DOUBLE PRECISION,
      last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `

  // inventory_transactions does NOT exist yet in this DB (confirmed live) — the trigger that
  // some migration scripts describe for auto-updating product_stock was therefore never active.
  // Following this codebase's own convention (business logic in TS, not DB triggers — see
  // receipts/_lib.ts, credit-notes/_lib.ts), applyStockMovement() below does the arithmetic
  // itself; this table is purely an audit ledger, no trigger attached.
  await sql`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      warehouse_id INTEGER,
      transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('in', 'out')),
      quantity NUMERIC(15,3) NOT NULL,
      reference_type VARCHAR(50),
      reference_id INTEGER,
      notes TEXT,
      created_by INTEGER,
      organization_id INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id)`
}

// بادئة حرف واحد لكل نوع — لتطابق طول كود السند (بادئة + رمز الدفتر + رقم تسلسلي = 10 خانات
// كحد أقصى دوماً؛ انظر lib/voucher-code.ts) المستخدم في باقي أنواع السندات هنا (R/P/C/D/J
// جميعها حرف واحد).
const STOCK_VOUCHER_SETTINGS_KEY: Record<number, { prefix: string; start: string; defaultPrefix: string }> = {
  [STOCK_IN_VCH_TYPE]: { prefix: "stock_in_prefix", start: "stock_in_start", defaultPrefix: "I" },
  [STOCK_OUT_VCH_TYPE]: { prefix: "stock_out_prefix", start: "stock_out_start", defaultPrefix: "O" },
  [INTERNAL_DELIVERY_VCH_TYPE]: { prefix: "internal_delivery_prefix", start: "internal_delivery_start", defaultPrefix: "T" },
  [USE_VOUCHER_VCH_TYPE]: { prefix: "use_voucher_prefix", start: "use_voucher_start", defaultPrefix: "U" },
}

// رقم السند = بادئة (إعدادات النظام) + رمز دفتر السندات + رقم تسلسلي، بنفس منطق
// getVoucherNumberSettings في receipts/_lib.ts وgetCreditNoteNumberSettings في credit-notes/_lib.ts.
export const getStockVoucherNumberSettings = async (
  requestUrl: string,
  vchType: number,
): Promise<{ prefix: string; startNumber: number }> => {
  const key = STOCK_VOUCHER_SETTINGS_KEY[vchType]
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
    console.error("Failed to load stock voucher numbering settings, using defaults:", error)
    return { prefix: defaultPrefix, startNumber: 1 }
  }
}

export const nextVoucherSequence = async (vchType: number, codePrefix: string, startNumber: number): Promise<number> => {
  const rows = await sql`
    SELECT vch_code FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code LIKE ${codePrefix + "%"}
  `
  let maxNumber = 0
  for (const row of rows) {
    const suffix = String(row.vch_code || "").slice(codePrefix.length)
    const match = suffix.match(/^[A-Za-z]?([0-9]+)$/)
    const value = Number(match?.[1] ?? suffix)
    if (Number.isFinite(value) && value > maxNumber) maxNumber = value
  }
  return maxNumber >= startNumber ? maxNumber + 1 : startNumber
}

export const resolveVoucherBookName = async (bookId: number | null): Promise<string> => {
  if (!bookId) return ""
  const rows = await sql`SELECT name FROM voucher_books_tbl WHERE id = ${bookId}`
  return rows[0]?.name || ""
}

// يتحقق عند الحفظ من أن رقم السند يبدأ ببادئة إعدادات النظام لهذا النوع وبطول لا يقل عن
// طول البادئة+رمز الدفتر (بدل الاكتفاء بفحص عدم الفراغ فقط) — يلتقط رقماً مبتوراً أو غير مطابق
// لصيغة الترقيم دون رفض أكواد قديمة/مستوردة لا تطابق الطول الكامل تماماً (بادئة+دفتر+6 أرقام).
export const validateVoucherCodeFormat = async (
  requestUrl: string,
  vchType: number,
  vchBookId: number | null,
  vchCode: string,
): Promise<string | null> => {
  const code = String(vchCode || "").trim().toUpperCase()
  if (!code) return "رقم السند مطلوب"
  const bookName = await resolveVoucherBookName(vchBookId)
  if (!bookName) return null // لا يمكن التحقق من البادئة دون دفتر سندات صالح — validateVoucher الأساسي يرفض غياب الدفتر أصلاً
  const { prefix } = await getStockVoucherNumberSettings(requestUrl, vchType)
  const basePrefix = `${prefix}${bookName}`
  if (!code.startsWith(prefix)) return `رقم السند يجب أن يبدأ بـ ${prefix}`
  // لا عدد أرقام تسلسل ثابت بعد الآن (ينكمش ديناميكياً لتبقى 10 خانات كحد أقصى — انظر
  // lib/voucher-code.ts) — يكفي التحقق من وجود رقم تسلسلي واحد على الأقل بعد البادئة+الدفتر.
  if (code.length < basePrefix.length + 1) return "رقم السند غير مكتمل"
  return null
}

// يُستخدَم عند تعارض رقم السند (مستخدم مسبقاً) لتوليد رقم بديل جديد وإعادة المحاولة — بدون قفل
// على مستوى قاعدة البيانات (لا SELECT...FOR UPDATE ولا قيد فريد يُمسَك من الطلب)، فيبقى هذا تخفيفاً
// للتعارض الناتج عن إدخال عدة مستخدمين سنداً بنفس اللحظة، وليس ضماناً مطلقاً لعدم التكرار.
export const regenerateVoucherCode = async (
  requestUrl: string,
  vchType: number,
  vchBookId: number | null,
): Promise<string | null> => {
  const bookName = await resolveVoucherBookName(vchBookId)
  if (!bookName) return null
  const { prefix, startNumber } = await getStockVoucherNumberSettings(requestUrl, vchType)
  const codePrefix = `${prefix}${bookName}`
  const sequence = await nextVoucherSequence(vchType, codePrefix, startNumber)
  return buildVoucherCode(prefix, bookName, sequence)
}

// أي أبعاد يتطلّبها كل نوع قياس، ومعادلة احتساب الكمية منها — نفس المنطق تماماً في
// unified-stock-voucher.tsx (measurementRequiresLength/Width/Height/Count وrecalcQuantityFromMeasurement)
// لكن مُعاد كتابتهما هنا حرفياً بدل استيرادهما (ملف واجهة أمامية .tsx بمعزل عن كود الخادم هنا)، ليبقيا
// حاجزاً خادمياً مستقلاً تماماً عن الواجهة — يُعيد احتساب نوع القياس وأبعاد الصنف الافتراضية من
// قاعدة البيانات مباشرة (لا من الطلب الوارد) فلا يعتمد على صحة ما أرسله العميل إطلاقاً.
const measurementRequiresLength = (measurmentId: number) => [2, 3, 4, 5, 8, 9, 10].includes(measurmentId)
const measurementRequiresWidth = (measurmentId: number) => [2, 3, 6, 8, 9].includes(measurmentId)
const measurementRequiresHeight = (measurmentId: number) => measurmentId === 3
const measurementRequiresCount = (measurmentId: number) => measurmentId !== 1

const recalcQuantityFromMeasurement = (
  measurmentId: number,
  length: number,
  width: number,
  height: number,
  count: number,
  productLength: number,
  productWidth: number,
  productDensity: number,
): number => {
  switch (measurmentId) {
    case 2:
    case 8:
      return width * length * count
    case 3:
      return length * width * height * count
    case 4:
    case 5:
      return length * count
    case 6:
      return (2 * length + 2 * width) * count
    case 7:
      return count
    case 9:
      return (productLength * length + productWidth * width) * count
    case 10:
      return productDensity * length * count
    default:
      return 0
  }
}

// يتحقق أن أبعاد/عدد كل صنف نوع قياسه غير عادي (products.measurment_id) مُدخَلة فعلاً، وأن "الكمية"
// المُرسَلة تطابق ناتج معادلة نوع القياس — يُعيد احتساب نوع القياس وأبعاد الصنف الافتراضية طازجة من
// قاعدة البيانات (لا من حقول measurment_id/product_length/... التي قد يُرسِلها العميل ضمن السطر،
// فهذه للعرض فقط بالواجهة ولا ثقة بها هنا). يُطبَّق على كل أنواع السندات (الأبعاد خاصية سطر مستقلة
// عن اتجاه الحركة)، بخلاف validateItemBatchExpiry أدناه المقصور على سند ادخال بضاعة.
export const validateItemMeasurement = async (items: any[]): Promise<string | null> => {
  const productIds = [...new Set(items.map((i: any) => Number(i.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (productIds.length === 0) return null
  const rows = await sql`SELECT id, product_name, measurment_id, length, width, density FROM products WHERE id = ANY(${productIds}::int[])`
  const productsById = new Map<number, any>(rows.map((r: any) => [Number(r.id), r]))
  for (const item of items) {
    const product = productsById.get(Number(item.product_id))
    if (!product) continue
    const measurmentId = Number(product.measurment_id || 1)
    if (measurmentId === 1) continue
    const label = item.product_name || product.product_name || item.product_code || ""
    const length = Number(item.length || 0)
    const width = Number(item.width || 0)
    const height = Number(item.height || 0)
    const count = Number(item.count || 0)
    if (measurementRequiresLength(measurmentId) && !(length > 0)) return `يجب ادخال الطول للصنف - ${label}`
    if (measurementRequiresWidth(measurmentId) && !(width > 0)) return `يجب ادخال العرض للصنف - ${label}`
    if (measurementRequiresHeight(measurmentId) && !(height > 0)) return `يجب ادخال الارتفاع للصنف - ${label}`
    if (measurementRequiresCount(measurmentId) && !(count > 0)) return `يجب ادخال العدد للصنف - ${label}`
    const expectedQuantity = recalcQuantityFromMeasurement(
      measurmentId,
      length,
      width,
      height,
      count,
      Number(product.length || 0),
      Number(product.width || 0),
      Number(product.density || 0),
    )
    if (Math.abs(expectedQuantity - Number(item.quantity || 0)) > 1e-6) {
      return `الكمية للصنف - ${label} - غير مطابقة لمعادلة نوع القياس (الطول×العرض×الارتفاع×العدد حسب النوع)`
    }
  }
  return null
}

// يتحقق من جهة الخادم (بمعزل عن أي علم مُخزَّن على الواجهة) أن كل صنف يتطلب تتبع تاريخ صلاحية
// و/أو رقم تشغيلي (products.has_expiry_date/has_batch_number — الأعمدة الفعلية في هذه القاعدة،
// مؤكَّدة عبر استجابة GET /api/inventory/products؛ وليس has_expiry/has_batch كما في بعض مسارات
// أخرى تخص جدول منتجات بمخطط مختلف) قد أُدخِل له تاريخ الصلاحية/الرقم التشغيلي فعلاً — يُطبَّق
// فقط على سند ادخال بضاعة (الأصناف تدخل للمخزون هنا، فيجب تسجيل دفعتها/صلاحيتها عند الإدخال؛
// باقي أنواع سندات الحركة تستهلك مخزوناً موجوداً أصلاً وليس من مسؤوليتها ذلك).
export const validateItemBatchExpiry = async (items: any[]): Promise<string | null> => {
  const productIds = [...new Set(items.map((i: any) => Number(i.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (productIds.length === 0) return null
  const rows = await sql`SELECT id, product_name, has_expiry_date, has_batch_number FROM products WHERE id = ANY(${productIds}::int[])`
  const flagsById = new Map<number, any>(rows.map((r: any) => [Number(r.id), r]))
  for (const item of items) {
    const flags = flagsById.get(Number(item.product_id))
    if (!flags) continue
    const label = item.product_name || flags.product_name || item.product_code || ""
    if (flags.has_expiry_date && !String(item.expiry_date || "").trim()) {
      return `يجب إدخال تاريخ الصلاحية للصنف: ${label}`
    }
    if (flags.has_batch_number && !String(item.batch_number || "").trim()) {
      return `يجب إدخال الرقم التشغيلي للصنف: ${label}`
    }
    // تاريخ الصلاحية الافتراضي عند اختيار صنف له تتبع صلاحية هو 1990-01-01 (قيمة اصطلاحية في
    // الواجهة يُعدّلها المستخدم لاحقاً) — أي تاريخ أقدم من 2020-01-01 عملياً يعني نسيان تعديلها،
    // فيُرفَض الحفظ من جهة الخادم أيضاً بدل الاعتماد فقط على تحقق الواجهة.
    if (flags.has_expiry_date && item.expiry_date && new Date(item.expiry_date).getTime() < new Date("2020-01-01").getTime()) {
      return `يرجى التأكد من تاريخ الصلاحية للصنف - ${label}`
    }
  }
  return null
}

// يتحقق من جهة الخادم (بمعزل عن الواجهة) أن كل مرجع مُدخَل بسطر الصنف — المستودع، الوحدة، وحساب/
// حسابات الصنف إن وُجدت — موجود فعلاً وحالته "نشط" (status=1)، لا محذوف/موقوف تم اختياره في نافذة
// كانت مفتوحة قبل حذفه/إيقافه. مشترك بين stock-vouchers (سند الاستعمال: expense_account_id/
// purchase_account_id) وsales-vouchers (account_id) عبر accountFields. الوحدة تُخزَّن بسطر الصنف
// باسمها (unit) لا بمعرّفها، فتُطابَق بالاسم على جدول units مباشرة.
export const validateItemReferences = async (items: any[], accountFields: string[] = []): Promise<string | null> => {
  const storeIds = [...new Set(items.map((i) => Number(i.store_id ?? i.warehouse_id)).filter((id) => Number.isFinite(id) && id > 0))]
  const warehouseRows = storeIds.length
    ? await sql`SELECT id, warehouse_name, status FROM warehouses WHERE id = ANY(${storeIds}::int[])`
    : []
  const warehousesById = new Map<number, any>(warehouseRows.map((r: any) => [Number(r.id), r]))

  const unitNames = [...new Set(items.map((i) => String(i.unit || "").trim().toLowerCase()).filter(Boolean))]
  const unitRows = unitNames.length ? await sql`SELECT id, unit_name, status FROM units WHERE LOWER(TRIM(unit_name)) = ANY(${unitNames}::text[])` : []
  const unitsByName = new Map<string, any>(unitRows.map((r: any) => [String(r.unit_name).trim().toLowerCase(), r]))

  const accountIds = accountFields.length
    ? [
        ...new Set(
          items
            .flatMap((i) => accountFields.map((field) => Number(i[field])))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ]
    : []
  const accountRows = accountIds.length ? await sql`SELECT id, code, name, status FROM account_tbl WHERE id = ANY(${accountIds}::int[])` : []
  const accountsById = new Map<number, any>(accountRows.map((r: any) => [Number(r.id), r]))

  for (const item of items) {
    const label = item.product_name || item.product_code || ""

    if (item.store_id ?? item.warehouse_id) {
      const warehouse = warehousesById.get(Number(item.store_id ?? item.warehouse_id))
      if (!warehouse) return `المستودع المحدد للصنف - ${label} - غير موجود`
      if (Number(warehouse.status) !== 1) return `المستودع المحدد للصنف - ${label} - غير نشط`
    }

    if (item.unit) {
      const unit = unitsByName.get(String(item.unit).trim().toLowerCase())
      if (!unit) return `الوحدة المحددة للصنف - ${label} - غير موجودة`
      if (Number(unit.status) !== 1) return `الوحدة المحددة للصنف - ${label} - غير نشطة`
    }

    for (const field of accountFields) {
      const accountId = Number(item[field])
      if (!(accountId > 0)) continue
      const account = accountsById.get(accountId)
      if (!account) return `الحساب المحدد للصنف - ${label} - غير موجود`
      if (Number(account.status) !== 1) return `الحساب المحدد للصنف - ${label} - غير نشط`
    }
  }

  return null
}

// يتحقق من جهة الخادم أن الكمية المطلوبة إخراجها لكل مجموعة (صنف، مستودع، دفعة، تاريخ صلاحية) لا
// تتجاوز "المتاح" الفعلي المُحتسَب طازجاً من voucher_items_tbl وقت الحفظ — نفس منطق ledger في
// /api/inventory/products/expiry-lots (IN من سند ادخال بضاعة ناقص OUT من بقية أنواع الحركة، مسودة
// ومُرحَّل معاً) لكن مُعاد احتسابه هنا من جهة الخادم بمعزل تام عمّا رآه العميل عند فتح ItemExpiryDatePicker
// — قد يكون قد مضى وقت (أو أدخل مستخدم آخر سنداً منافساً على نفس الدفعة بالتزامن) منذ ذلك الحين.
// يُطبَّق فقط على أنواع الاستهلاك الثلاثة (اخراج بضاعة/ارسالية داخلية/استعمال)؛ سند ادخال بضاعة
// يُدخِل دفعات جديدة فلا "متاح" يُستهلَك منه أصلاً. excludeVoucherId يستثني سطور السند نفسه عند
// تعديل سند موجود (PUT) — وإلا يحتسب الفحص وجود السند القديم كاستهلاك من نفسه، فيرفض حفظ سند لم
// تتغيّر كميته إطلاقاً.
export const validateAvailableQuantity = async (
  items: any[],
  vchType: number,
  excludeVoucherId: number | null,
): Promise<string | null> => {
  if (vchType !== STOCK_OUT_VCH_TYPE && vchType !== INTERNAL_DELIVERY_VCH_TYPE && vchType !== USE_VOUCHER_VCH_TYPE) {
    return null
  }

  // فقط الأصناف المرتبطة فعلاً بدفعة/تاريخ صلاحية (رقم تشغيلي أو تاريخ صلاحية حقيقي، لا الفارغ ولا
  // القيمة الاصطلاحية 1990-01-01 التي تحملها الأصناف غير المتتبَّعة بعد saveVoucherItems أعلاه)
  // تحتاج فحص توفّر بمستوى الدفعة — أصناف بلا تتبع دفعة ليس لها "متاح" محدَّد الدفعة أصلاً.
  const trackedItems = items.filter(
    (i) => String(i.batch_number || "").trim() || (i.expiry_date && String(i.expiry_date).slice(0, 10) !== NO_EXPIRY_SENTINEL_DATE),
  )
  if (trackedItems.length === 0) return null

  const productIds = [...new Set(trackedItems.map((i) => Number(i.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
  const unitRows = productIds.length
    ? await sql`
        SELECT pu.product_id, u.unit_name, pu.to_main_qnty
        FROM product_units pu
        LEFT JOIN units u ON pu.unit_id = u.id
        WHERE pu.product_id = ANY(${productIds}::int[])
      `
    : []
  const toMainQtyByKey = new Map<string, number>(
    (unitRows as any[]).map((r) => [`${r.product_id}|${r.unit_name}`, Number(r.to_main_qnty) || 1]),
  )

  // تُجمَّع الكمية المطلوبة أولاً (بالوحدة الرئيسية، محوَّلة بمعامل تحويل وحدة كل سطر على حِدة —
  // نفس السند قد يكرّر الصنف بأكثر من سطر بوحدات مختلفة) بدل فحص كل سطر بمعزل، وإلا يمر فحصان
  // منفصلان لكل منهما نصف الكمية المطلوبة رغم تجاوز مجموعهما "المتاح" فعلياً.
  const groups = new Map<
    string,
    { productId: number; storeId: number; batchNumber: string; expiryDate: string; mainQty: number; label: string }
  >()
  for (const item of trackedItems) {
    const productId = Number(item.product_id)
    const storeId = Number(item.warehouse_id)
    if (!productId || !storeId) continue
    const toMainQty = toMainQtyByKey.get(`${productId}|${item.unit || ""}`) ?? 1
    const mainQty = Number(item.quantity || 0) * toMainQty
    if (mainQty <= 0) continue
    const batchNumber = String(item.batch_number || "").trim()
    const expiryDate = item.expiry_date ? String(item.expiry_date).slice(0, 10) : ""
    const key = `${productId}|${storeId}|${batchNumber}|${expiryDate}`
    const existing = groups.get(key)
    if (existing) {
      existing.mainQty += mainQty
    } else {
      groups.set(key, {
        productId,
        storeId,
        batchNumber,
        expiryDate,
        mainQty,
        label: item.product_name || item.product_code || "",
      })
    }
  }

  for (const group of groups.values()) {
    const rows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN vh.vch_type = ${STOCK_IN_VCH_TYPE} THEN vi.quantity * COALESCE(pu.to_main_qnty, 1)
        ELSE -(vi.quantity * COALESCE(pu.to_main_qnty, 1)) END
      ), 0) AS available_main
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      LEFT JOIN units u ON u.unit_name = vi.unit
      LEFT JOIN product_units pu ON pu.product_id = vi.product_id AND pu.unit_id = u.id
      WHERE vi.product_id = ${group.productId}
        AND vi.store_id = ${group.storeId}
        AND COALESCE(vi.batch_number, '') = ${group.batchNumber}
        AND COALESCE(vi.expiry_date::text, '') = ${group.expiryDate}
        AND vh.status IN (1, 2)
        AND vh.vch_type = ANY(${STOCK_VOUCHER_TYPES as unknown as number[]}::int[])
        AND vh.id != ${excludeVoucherId ?? -1}
    `
    const availableMain = Number((rows as any[])[0]?.available_main || 0)
    // هامش تسامح صغير لأخطاء الفاصلة العائمة (DOUBLE PRECISION) بدل رفض حالات متساوية فعلياً.
    if (group.mainQty > availableMain + 1e-9) {
      const batchLabel = group.batchNumber ? ` - دفعة ${group.batchNumber}` : ""
      const expiryLabel = group.expiryDate ? ` - صلاحية ${group.expiryDate}` : ""
      return `الكمية المطلوبة أكبر من الكمية المتاحة للصنف ${group.label}${batchLabel}${expiryLabel}`
    }
  }

  return null
}

// عند تعديل سند ادخال بضاعة موجود (PUT، لا الإنشاء الجديد عبر POST — لا "أسطر قديمة" هناك أصلاً):
// يتحقق أن استبدال أسطره القديمة بالجديدة (تغيير الصنف/الكمية/المستودع/الوحدة، أو حذف سطر بالكامل)
// لن يجعل "المتاح" لأي مجموعة (صنف، مستودع، دفعة، تاريخ صلاحية) كانت هذه الأسطر القديمة توفّرها
// سالباً — أي دفعة استُهلِكت فعلياً (كلياً أو جزئياً) عبر سند اخراج/استعمال/ارسالية داخلية لاحق
// بالاعتماد على المزيج القديم (صنف/مستودع/دفعة/صلاحية)، لم يعد هذا السند يوفّره بنفس القدر بعد
// التعديل. مطابق فكرياً لِـvalidateVoucherDeletion (نفس استعلام "المتاح باستثناء هذا السند") لكن
// يُضيف مساهمة الأسطر الجديدة (إن بقيت تخص نفس المجموعة) بدل افتراض إزالة كاملة للسند كما هناك.
export const validateStockInEditAvailability = async (voucherId: number, newItems: any[]): Promise<string | null> => {
  const oldItemsRaw = await sql`SELECT * FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  const oldTracked = (oldItemsRaw as any[]).filter(
    (i) => String(i.batch_number || "").trim() || (i.expiry_date && String(i.expiry_date).slice(0, 10) !== NO_EXPIRY_SENTINEL_DATE),
  )
  if (oldTracked.length === 0) return null

  const productIds = [...new Set(oldTracked.map((i) => Number(i.product_id)).filter((id) => Number.isFinite(id) && id > 0))]
  const unitRows = productIds.length
    ? await sql`
        SELECT pu.product_id, u.unit_name, pu.to_main_qnty
        FROM product_units pu
        LEFT JOIN units u ON pu.unit_id = u.id
        WHERE pu.product_id = ANY(${productIds}::int[])
      `
    : []
  const toMainQtyByKey = new Map<string, number>(
    (unitRows as any[]).map((r) => [`${r.product_id}|${r.unit_name}`, Number(r.to_main_qnty) || 1]),
  )

  // مجموعات المزيج القديم (صنف/مستودع/دفعة/صلاحية) التي ساهم بها هذا السند قبل التعديل.
  const oldGroups = new Map<string, { productId: number; storeId: number; batchNumber: string; expiryDate: string; label: string }>()
  for (const item of oldTracked) {
    const productId = Number(item.product_id)
    const storeId = Number(item.store_id)
    if (!productId || !storeId) continue
    const batchNumber = String(item.batch_number || "").trim()
    const expiryDate = item.expiry_date ? String(item.expiry_date).slice(0, 10) : ""
    const key = `${productId}|${storeId}|${batchNumber}|${expiryDate}`
    if (!oldGroups.has(key)) {
      oldGroups.set(key, { productId, storeId, batchNumber, expiryDate, label: item.product_name || item.product_code || "" })
    }
  }

  // مساهمة الأصناف الجديدة (بعد التعديل) لكل من نفس مفاتيح المجموعات القديمة — صفر إن لم يعد
  // السطر الجديد يطابق نفس المزيج إطلاقاً (صنف مختلف، أو مستودع/دفعة/صلاحية مختلفة).
  const newQtyByKey = new Map<string, number>()
  for (const item of newItems) {
    const productId = Number(item.product_id)
    const storeId = Number(item.warehouse_id)
    if (!productId || !storeId) continue
    const toMainQty = toMainQtyByKey.get(`${productId}|${item.unit || ""}`) ?? 1
    const mainQty = Number(item.quantity || 0) * toMainQty
    if (mainQty <= 0) continue
    const batchNumber = String(item.batch_number || "").trim()
    const expiryDate = item.expiry_date ? String(item.expiry_date).slice(0, 10) : ""
    const key = `${productId}|${storeId}|${batchNumber}|${expiryDate}`
    newQtyByKey.set(key, (newQtyByKey.get(key) || 0) + mainQty)
  }

  for (const [key, group] of oldGroups.entries()) {
    const rows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN vh.vch_type = ${STOCK_IN_VCH_TYPE} THEN vi.quantity * COALESCE(pu.to_main_qnty, 1)
        ELSE -(vi.quantity * COALESCE(pu.to_main_qnty, 1)) END
      ), 0) AS available_main
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      LEFT JOIN units u ON u.unit_name = vi.unit
      LEFT JOIN product_units pu ON pu.product_id = vi.product_id AND pu.unit_id = u.id
      WHERE vi.product_id = ${group.productId}
        AND vi.store_id = ${group.storeId}
        AND COALESCE(vi.batch_number, '') = ${group.batchNumber}
        AND COALESCE(vi.expiry_date::text, '') = ${group.expiryDate}
        AND vh.status IN (1, 2)
        AND vh.vch_type = ANY(${STOCK_VOUCHER_TYPES as unknown as number[]}::int[])
        AND vh.id != ${voucherId}
    `
    const availableExcludingThis = Number((rows as any[])[0]?.available_main || 0)
    const newContribution = newQtyByKey.get(key) || 0
    const projected = availableExcludingThis + newContribution
    if (projected < -1e-9) {
      const expiryLabel = group.expiryDate ? ` ${group.expiryDate}` : ""
      return `تعديل السند تسبب بوجود كميات سالبة لتاريخ الصلاحية${expiryLabel} - ${group.label}`
    }
  }

  return null
}

// تاريخ صلاحية اصطلاحي يُسجَّل للأصناف غير المتتبَّعة (has_expiry_date=false) بدل NULL — يُبقي كل
// سطور voucher_items_tbl تحمل قيمة موحَّدة قابلة للمقارنة/التجميع دوماً (تُستخدَم كمفتاح تجميع في
// ledger "المتاح" لكل من /api/inventory/products/expiry-lots وvalidateAvailableQuantity أدناه)،
// ويُميَّز بها بوضوح "صنف بلا تتبع دفعة" عن "صنف متتبَّع لم يُدخَل له تاريخ بعد" (NULL الحقيقي).
export const NO_EXPIRY_SENTINEL_DATE = "1990-01-01"

export const saveVoucherItems = async (voucherId: number, items: any[]) => {
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`CREATE TABLE IF NOT EXISTS voucher_item_attributes_tbl (id BIGSERIAL PRIMARY KEY, voucher_item_id INTEGER NOT NULL REFERENCES voucher_items_tbl(id) ON DELETE CASCADE, product_attribute_value_id BIGINT NOT NULL REFERENCES product_atrributes_values_tbl(id) ON DELETE CASCADE, UNIQUE(voucher_item_id, product_attribute_value_id))`
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
    const unitName = String(row.unit || row.unit_name || "").trim()
    const rawUnitId = row.unit_id ?? row.unitId ?? null
    const resolvedUnitId = Number(rawUnitId ?? null) > 0 ? Number(rawUnitId) : null
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
  return rows
}

// عند حذف سند فعلياً (مسودة، archiveAndDeleteStockVoucher) أو إلغائه منطقياً (status=3 لسند
// مُرحَّل، PUT أدناه) — يتحقق أن إزالة مساهمة هذا السند من ledger كل مجموعة (صنف، مستودع، دفعة،
// تاريخ صلاحية) لمسها أحد سطوره لن تجعل "المتاح" لتلك المجموعة سالباً. الحالة الفعلية الوحيدة
// القابلة للحدوث عملياً: حذف/إلغاء سند ادخال بضاعة (IN) دفعةٌ منه استُهلِكت فعلاً (كلياً أو جزئياً)
// عبر سند اخراج/استعمال/ارسالية داخلية آخر لاحق — حذف/إلغاء أي من الأنواع الثلاثة الأخرى (OUT) لا
// يمكن أن يُسبِّب قيمة سالبة إطلاقاً (إعادة كمية للمتاح فقط تزيده لا تُنقِصه)، فيبقى هذا الفحص آمناً
// وعديم الأثر تلقائياً لتلك الأنواع دون حاجة لتمييزها صراحةً.
export const validateVoucherDeletion = async (voucherId: number): Promise<string | null> => {
  const items = await sql`SELECT * FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  const trackedItems = (items as any[]).filter(
    (i) => String(i.batch_number || "").trim() || (i.expiry_date && String(i.expiry_date).slice(0, 10) !== NO_EXPIRY_SENTINEL_DATE),
  )
  if (trackedItems.length === 0) return null

  const groups = new Map<string, { productId: number; storeId: number; batchNumber: string; expiryDate: string; label: string }>()
  for (const item of trackedItems) {
    const productId = Number(item.product_id)
    const storeId = Number(item.stor)
    if (!productId || !storeId) continue
    const batchNumber = String(item.batch_number || "").trim()
    const expiryDate = item.expiry_date ? String(item.expiry_date).slice(0, 10) : ""
    const key = `${productId}|${storeId}|${batchNumber}|${expiryDate}`
    if (!groups.has(key)) {
      groups.set(key, { productId, storeId, batchNumber, expiryDate, label: item.product_name || item.product_code || "" })
    }
  }

  for (const group of groups.values()) {
    const rows = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN vh.vch_type = ${STOCK_IN_VCH_TYPE} THEN vi.quantity * COALESCE(pu.to_main_qnty, 1)
        ELSE -(vi.quantity * COALESCE(pu.to_main_qnty, 1)) END
      ), 0) AS available_main
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      LEFT JOIN units u ON u.unit_name = vi.unit
      LEFT JOIN product_units pu ON pu.product_id = vi.product_id AND pu.unit_id = u.id
      WHERE vi.product_id = ${group.productId}
        AND vi.store_id = ${group.storeId}
        AND COALESCE(vi.batch_number, '') = ${group.batchNumber}
        AND COALESCE(vi.expiry_date::text, '') = ${group.expiryDate}
        AND vh.status IN (1, 2)
        AND vh.vch_type = ANY(${STOCK_VOUCHER_TYPES as unknown as number[]}::int[])
        AND vh.id != ${voucherId}
    `
    const availableExcludingThis = Number((rows as any[])[0]?.available_main || 0)
    if (availableExcludingThis < -1e-9) {
      const batchLabel = group.batchNumber ? ` - دفعة ${group.batchNumber}` : ""
      const expiryLabel = group.expiryDate ? ` - صلاحية ${group.expiryDate}` : ""
      return `لا يمكن حذف/إلغاء السند: كمية الصنف ${group.label}${batchLabel}${expiryLabel} مُستهلَكة بالفعل في سند آخر`
    }
  }

  return null
}

export const fetchVoucherItems = async (voucherId: number) => {
  // voucher_items_tbl يخزّن المعرّفات فقط (store_id وغيرها من حقول السطر) — تُجلَب هنا عبر JOIN
  // وإلا تبقى فارغة في الشبكة عند عرض/تحميل سند محفوظ سابقاً.
  // سابقاً (رغم امتلاء المعرّفات نفسها) — نفس سبب/إصلاح مشكلة warehouse_name سابقاً، يُطبَّق الآن
  // أيضاً على حسابي المصروف/المشتريات لسند الاستعمال (تفاصيل حسابات الاصناف).
  // جدول الحسابات الفعلي account_tbl (بعمودي code/name خامين) — وليس accounts (غير موجود؛ هذا هو
  // اسم النوع TypeScript المستخدَم في الواجهة فقط)؛ مؤكَّد عبر app/api/accounts/route.ts.
  const rows = await sql`
    SELECT
      vi.id,
      vi.voucher_id,
      vi.item_id AS product_id,
      vi.item_id AS item_id,
      vi.item_name AS item_name,
      vi.unit_id,
      vi.qnty AS quantity,
      vi.bonus,
      vi.discount,
      vi.vat_classification_id,
      vi.vat_amount,
      vi.vat_ratio,
      vi.price AS unit_price,
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
      vi.production_date,
      vi.expiry_date,
      vi.batch_no AS batch_number,
      vi.store_id AS warehouse_id,
      vi.store_id AS store_id,
      vi.journal_id,
      vi.return_sales_invoice_id,
      COALESCE(p.product_code, '') AS product_code,
      p.product_code AS current_product_code,
      COALESCE(p.product_name, vi.item_name, '') AS product_name,
      p.product_name AS current_product_name,
      w.warehouse_name AS warehouse_name,
      (vi.qnty * vi.price) AS total_price,
      (vi.qnty * vi.price) AS amount,
      (vi.qnty * vi.price) AS line_amount
    FROM voucher_items_tbl vi
    LEFT JOIN products p ON p.id = vi.item_id
    LEFT JOIN warehouses w ON w.id = vi.store_id
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

// كمية موقّعة حسب اتجاه الحركة — 'in' تزيد current_stock، 'out' تنقصه. warehouseId هنا اسمي
// فقط (يُسجَّل في inventory_transactions للتدقيق) لأن product_stock لا يملك بُعد مستودع في هذه
// القاعدة (فقط product_id + organization_id) — انظر ملاحظة "Internal Delivery" في خطة التنفيذ.
export const applyStockMovement = async (
  items: { product_id: number; quantity: number; store_id?: number | null; warehouse_id?: number | null }[],
  direction: "in" | "out",
  referenceId: number,
  warehouseIdOverride?: number | null,
  organizationId = 1,
  // "stock_voucher" افتراضياً (السلوك الحالي دون تغيير) — sales-vouchers/_lib.ts يمرّر
  // "sales_voucher" صراحةً بدل ذلك لتمييز حركة مخزون سندات المبيعات (إرسالية مبيعات وما شابهها) عن
  // سندات المخزون نفسها في inventory_transactions، رغم مشاركة نفس دفتر product_stock الفعلي.
  referenceType: string = "stock_voucher",
) => {
  for (const item of items) {
    const productId = Number(item.product_id)
    const quantity = Number(item.quantity || 0)
    if (!productId || quantity <= 0) continue
    const delta = direction === "in" ? quantity : -quantity

    // ON CONFLICT (product_id) فقط — هذا القيد الفريد الفعلي الموجود على الجدول الحي
    // (product_stock_product_id_key)؛ إعلان الجدول أدناه في ensureTables كان يفترض قيداً مركّباً
    // مع organization_id لم يُطبَّق فعلياً لأن الجدول كان موجوداً مسبقاً قبل هذا الكود (CREATE TABLE
    // IF NOT EXISTS لم يُنفَّذ)، وON CONFLICT بقيد غير مطابق يُفشِل الإدراج بخطأ Postgres صريح —
    // وهو ما كان يُفشِل كل عملية ترحيل (status=2) لسندات الحركة رغم نجاح الحفظ العادي.
    await sql`
      INSERT INTO product_stock (product_id, organization_id, current_stock)
      VALUES (${productId}, ${organizationId}, ${delta})
      ON CONFLICT (product_id)
      DO UPDATE SET current_stock = product_stock.current_stock + ${delta}, last_updated = CURRENT_TIMESTAMP
    `

    await sql`
      INSERT INTO inventory_transactions (
        product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, organization_id
      ) VALUES (
        ${productId}, ${warehouseIdOverride ?? item.store_id ?? item.warehouse_id ?? null}, ${direction}, ${quantity},
        ${referenceType}, ${referenceId}, ${organizationId}
      )
    `
  }
}

// يعكس أي حركة مخزون سُجِّلت سابقاً لهذا السند (عند حذفه أو إلغاء ترحيله) — يقرأ
// inventory_transactions الفعلية بدل إعادة بناء الاتجاه من نوع السند، فيبقى صحيحاً حتى
// للإرسالية الداخلية (سطرا in/out معاً).
export const reverseStockMovement = async (referenceId: number, organizationId = 1, referenceType: string = "stock_voucher") => {
  const rows = await sql`
    SELECT product_id, warehouse_id, transaction_type, quantity
    FROM inventory_transactions
    WHERE reference_type = ${referenceType} AND reference_id = ${referenceId}
  `
  for (const row of rows) {
    const delta = row.transaction_type === "in" ? -Number(row.quantity) : Number(row.quantity)
    await sql`
      UPDATE product_stock SET current_stock = current_stock + ${delta}, last_updated = CURRENT_TIMESTAMP
      WHERE product_id = ${row.product_id} AND organization_id = ${organizationId}
    `
  }
  await sql`DELETE FROM inventory_transactions WHERE reference_type = ${referenceType} AND reference_id = ${referenceId}`
}

// تُطبَّق فقط عند status=2 (مرحّل) — مسودة (status=1) لا تحرّك المخزون إطلاقاً.
export const applyVoucherStockEffect = async (vchType: number, voucherId: number, items: any[], fromStoreId: number | null, toStoreId: number | null) => {
  if (vchType === STOCK_IN_VCH_TYPE) {
    await applyStockMovement(items, "in", voucherId, toStoreId)
  } else if (vchType === STOCK_OUT_VCH_TYPE || vchType === USE_VOUCHER_VCH_TYPE) {
    await applyStockMovement(items, "out", voucherId, toStoreId)
  } else if (vchType === INTERNAL_DELIVERY_VCH_TYPE) {
    // ينتج عنه صافي صفر على current_stock (الكمية الإجمالية لم تتغيّر، فقط موقعها) — سطرا
    // in/out يبقيان فقط كأثر تدقيقي (انظر الملاحظة في خطة التنفيذ حول عدم وجود بُعد مستودع
    // حقيقي في product_stock حالياً).
    await applyStockMovement(items, "out", voucherId, fromStoreId)
    await applyStockMovement(items, "in", voucherId, toStoreId)
  }
}

// سند استعمال فقط: قيد محاسبي لكل سطر صنف — مدين حساب المصروف / دائن حساب المشتريات
// (المخزون)، بنفس مبلغ الصنف، مطابقاً لتبويب "تفاصيل حسابات الاصناف" في الشاشة المرجعية.
export const buildUseVoucherJournalRows = (items: any[], currencyId: number | null, rate: number) => {
  const rows: any[] = []
  let orderNo = 1
  for (const item of items) {
    const amount = Number(item.total_price || 0)
    if (amount <= 0) continue
    if (item.expense_account_id) {
      rows.push({
        order_no: orderNo++,
        journal_type_id: 14, // 'حساب المصروف سند الاستعمال' (voucher_journal_type_caption_tbl)
        account_id: Number(item.expense_account_id),
        credit_debit: 1,
        amount,
        note: item.product_name || "",
        cost_centers: Array.isArray(item.expense_cost_centers) ? item.expense_cost_centers : [],
      })
    }
    if (item.purchase_account_id) {
      rows.push({
        order_no: orderNo++,
        journal_type_id: 9, // 'المشتريات'
        account_id: Number(item.purchase_account_id),
        credit_debit: 2,
        amount,
        note: item.product_name || "",
        cost_centers: Array.isArray(item.purchase_cost_centers) ? item.purchase_cost_centers : [],
      })
    }
  }
  return rows.map((row) => ({
    ...row,
    currency_id: currencyId,
    rate,
    base_curr_amount: Math.round(row.amount * rate * 100) / 100,
  }))
}

// الحذف الفعلي متاح فقط لسند بحالة "فعال" (status=1) — سند مُرحَّل يُلغى منطقياً (status=3)
// بدل حذفه. يعكس أي حركة مخزون (وقيد محاسبي لسند الاستعمال) سُجِّلت له قبل الحذف الفعلي.
export const archiveAndDeleteStockVoucher = async (voucherId: number): Promise<{ error?: string }> => {
  const headerRows = await sql`SELECT * FROM voucher_header_tbl WHERE id = ${voucherId}`
  if (headerRows.length === 0) return { error: "السند غير موجود" }
  const voucher = headerRows[0]
  if (Number(voucher.status) !== 1) {
    return { error: "لا يمكن الحذف الفعلي إلا لسند بحالة فعال (غير مرحّل)" }
  }

  const deletionError = await validateVoucherDeletion(voucherId)
  if (deletionError) return { error: deletionError }

  await reverseStockMovement(voucherId)
  await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_header_tbl WHERE id = ${voucherId}`

  return {}
}
