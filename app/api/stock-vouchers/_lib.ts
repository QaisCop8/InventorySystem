import sql from "@/lib/database"

// Shared schema + persistence helpers for the 4 new item-quantity vouchers:
// سند ادخال بضاعة (Stock In), سند اخراج بضاعة (Stock Out), ارسالية داخلية (Internal Delivery),
// سند استعمال (Use Voucher). All four share voucher_header_tbl (from app/api/receipts/_lib.ts)
// as their header table, plus a new voucher_items_tbl child table for item lines. Used by
// route.ts, [id]/route.ts and navigation/[navigationType]/route.ts.

export const STOCK_IN_VCH_TYPE = 12
export const STOCK_OUT_VCH_TYPE = 13
export const INTERNAL_DELIVERY_VCH_TYPE = 14
export const USE_VOUCHER_VCH_TYPE = 15

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
      ser INTEGER,
      product_id INTEGER,
      product_code VARCHAR(50),
      product_name VARCHAR(200),
      warehouse_id INTEGER,
      unit VARCHAR(50),
      quantity DOUBLE PRECISION DEFAULT 0,
      bonus_quantity DOUBLE PRECISION DEFAULT 0,
      unit_price DOUBLE PRECISION DEFAULT 0,
      discount_percent DOUBLE PRECISION DEFAULT 0,
      total_price DOUBLE PRECISION DEFAULT 0,
      batch_number VARCHAR(50),
      expiry_date DATE,
      -- سند استعمال only: per-item GL posting (expense account debited, purchases/inventory
      -- contra account credited), each optionally split across cost centers.
      expense_account_id INTEGER,
      purchase_account_id INTEGER,
      expense_cost_centers JSONB,
      purchase_cost_centers JSONB,
      note VARCHAR(200)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_items_tbl_voucher_id ON voucher_items_tbl(voucher_id)`

  // product_stock already exists in this DB (created by an earlier, separate migration) but is
  // re-declared IF NOT EXISTS here defensively, matching this codebase's convention of never
  // assuming another module's table already ran on a fresh install.
  await sql`
    CREATE TABLE IF NOT EXISTS product_stock (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      organization_id INTEGER DEFAULT 1,
      current_stock DOUBLE PRECISION DEFAULT 0,
      available_stock DOUBLE PRECISION DEFAULT 0,
      reserved_stock DOUBLE PRECISION DEFAULT 0,
      reorder_level DOUBLE PRECISION,
      max_stock_level DOUBLE PRECISION,
      last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (product_id, organization_id)
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

const VOUCHER_CODE_SEQUENCE_DIGITS = 6

// بادئة حرف واحد لكل نوع — لتطابق طول كود السند (بادئة + رمز الدفتر + 6 أرقام = 8 خانات)
// المستخدم في باقي أنواع السندات هنا (R/P/C/D/J جميعها حرف واحد).
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
    const response = await fetch(new URL("/api/settings/system", requestUrl))
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

export const buildVoucherCode = (prefix: string, bookName: string, sequence: number): string =>
  `${prefix}${bookName}${String(sequence).padStart(VOUCHER_CODE_SEQUENCE_DIGITS, "0")}`

export const nextVoucherSequence = async (vchType: number, codePrefix: string, startNumber: number): Promise<number> => {
  const rows = await sql`
    SELECT vch_code FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code LIKE ${codePrefix + "%"}
  `
  let maxNumber = 0
  for (const row of rows) {
    const numericPart = String(row.vch_code || "").slice(codePrefix.length)
    const value = Number(numericPart)
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
  if (!code.startsWith(prefix)) return `رقم السند يجب أن يبدأ بـ ${prefix}`
  if (code.length < prefix.length + bookName.length) return "رقم السند غير مكتمل"
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

export const saveVoucherItems = async (voucherId: number, items: any[]) => {
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  const rows = (Array.isArray(items) ? items : []).filter((row) => row?.product_id && Number(row?.quantity || 0) > 0)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    await sql`
      INSERT INTO voucher_items_tbl (
        voucher_id, ser, product_id, product_code, product_name, warehouse_id, unit,
        quantity, bonus_quantity, unit_price, discount_percent, total_price,
        batch_number, expiry_date, expense_account_id, purchase_account_id,
        expense_cost_centers, purchase_cost_centers, note
      ) VALUES (
        ${voucherId}, ${i + 1}, ${row.product_id}, ${row.product_code || ""}, ${row.product_name || ""},
        ${row.warehouse_id || null}, ${row.unit || ""},
        ${Number(row.quantity || 0)}, ${Number(row.bonus_quantity || 0)}, ${Number(row.unit_price || 0)},
        ${Number(row.discount_percent || 0)}, ${Number(row.total_price || 0)},
        ${row.batch_number || null}, ${row.expiry_date || null},
        ${row.expense_account_id || null}, ${row.purchase_account_id || null},
        ${JSON.stringify(row.expense_cost_centers || [])}, ${JSON.stringify(row.purchase_cost_centers || [])},
        ${row.note || ""}
      )
    `
  }
  return rows
}

export const fetchVoucherItems = async (voucherId: number) => {
  // voucher_items_tbl يخزّن warehouse_id فقط (بلا عمود اسم) — يُجلَب اسم المستودع هنا عبر JOIN
  // وإلا يبقى عمود المستودع فارغاً في الشبكة عند عرض/تحميل سند محفوظ سابقاً (رغم امتلاء warehouse_id).
  return sql`
    SELECT vi.*, p.product_code AS current_product_code, p.product_name AS current_product_name,
           w.warehouse_name AS warehouse_name
    FROM voucher_items_tbl vi
    LEFT JOIN products p ON p.id = vi.product_id
    LEFT JOIN warehouses w ON w.id = vi.warehouse_id
    WHERE vi.voucher_id = ${voucherId}
    ORDER BY vi.ser, vi.id
  `
}

// كمية موقّعة حسب اتجاه الحركة — 'in' تزيد current_stock، 'out' تنقصه. warehouseId هنا اسمي
// فقط (يُسجَّل في inventory_transactions للتدقيق) لأن product_stock لا يملك بُعد مستودع في هذه
// القاعدة (فقط product_id + organization_id) — انظر ملاحظة "Internal Delivery" في خطة التنفيذ.
export const applyStockMovement = async (
  items: { product_id: number; quantity: number; warehouse_id?: number | null }[],
  direction: "in" | "out",
  referenceId: number,
  warehouseIdOverride?: number | null,
  organizationId = 1,
) => {
  for (const item of items) {
    const productId = Number(item.product_id)
    const quantity = Number(item.quantity || 0)
    if (!productId || quantity <= 0) continue
    const delta = direction === "in" ? quantity : -quantity

    await sql`
      INSERT INTO product_stock (product_id, organization_id, current_stock)
      VALUES (${productId}, ${organizationId}, ${delta})
      ON CONFLICT (product_id, organization_id)
      DO UPDATE SET current_stock = product_stock.current_stock + ${delta}, last_updated = CURRENT_TIMESTAMP
    `

    await sql`
      INSERT INTO inventory_transactions (
        product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, organization_id
      ) VALUES (
        ${productId}, ${warehouseIdOverride ?? item.warehouse_id ?? null}, ${direction}, ${quantity},
        'stock_voucher', ${referenceId}, ${organizationId}
      )
    `
  }
}

// يعكس أي حركة مخزون سُجِّلت سابقاً لهذا السند (عند حذفه أو إلغاء ترحيله) — يقرأ
// inventory_transactions الفعلية بدل إعادة بناء الاتجاه من نوع السند، فيبقى صحيحاً حتى
// للإرسالية الداخلية (سطرا in/out معاً).
export const reverseStockMovement = async (referenceId: number, organizationId = 1) => {
  const rows = await sql`
    SELECT product_id, warehouse_id, transaction_type, quantity
    FROM inventory_transactions
    WHERE reference_type = 'stock_voucher' AND reference_id = ${referenceId}
  `
  for (const row of rows) {
    const delta = row.transaction_type === "in" ? -Number(row.quantity) : Number(row.quantity)
    await sql`
      UPDATE product_stock SET current_stock = current_stock + ${delta}, last_updated = CURRENT_TIMESTAMP
      WHERE product_id = ${row.product_id} AND organization_id = ${organizationId}
    `
  }
  await sql`DELETE FROM inventory_transactions WHERE reference_type = 'stock_voucher' AND reference_id = ${referenceId}`
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

  await reverseStockMovement(voucherId)
  await sql`DELETE FROM voucher_journal_detail_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_items_tbl WHERE voucher_id = ${voucherId}`
  await sql`DELETE FROM voucher_header_tbl WHERE id = ${voucherId}`

  return {}
}
