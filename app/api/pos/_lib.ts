import { NextResponse } from "next/server"
import { resolvePosAccounts } from "@/lib/pos-accounts"
import sql from "@/lib/database"
import { hasPosCashierPermission } from "@/lib/permissions"
import { hasPermissionApproval, permissionRequiredBody } from "@/lib/permission-approvals"
import { POS_CASHIER_PERMISSIONS, type PosCashierPermission } from "@/lib/transaction-permission-definitions"
import { runSchemaOnce } from "@/lib/schema-once"

export const POS_PAYMENT_METHODS = ["cash", "card", "cheque", "account", "gift_card"] as const

export async function ensurePosTables() { return runSchemaOnce("app/api/pos/_lib.ts#ensurePosTables", async () => {
  await sql`CREATE TABLE IF NOT EXISTS users_currencies_default_account_tbl (
    id SERIAL PRIMARY KEY, user_id INTEGER, currency_id INTEGER, account_id INTEGER,
    received_cheqs_account_id INTEGER, returned_cheqs_account_id INTEGER, cards_account_id INTEGER
  )`
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS pos_sold_using_scale BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`
    CREATE TABLE IF NOT EXISTS pos_points_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(12) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      branch_id INTEGER NOT NULL,
      main_warehouse_id INTEGER NOT NULL,
      currency_id INTEGER NOT NULL,
      sales_book_id INTEGER NOT NULL,
      return_book_id INTEGER,
      cash_account_id INTEGER,
      card_account_id INTEGER,
      cheque_account_id INTEGER,
      receivable_account_id INTEGER,
      gift_account_id INTEGER,
      walk_in_account_id INTEGER,
      tax_account_id INTEGER,
      price_category_id INTEGER NOT NULL DEFAULT 1,
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
      max_discount_percent NUMERIC(9,4) NOT NULL DEFAULT 100,
      allow_offline BOOLEAN NOT NULL DEFAULT true,
      allow_returns BOOLEAN NOT NULL DEFAULT true,
      allow_gifts BOOLEAN NOT NULL DEFAULT true,
      print_invoices BOOLEAN NOT NULL DEFAULT false,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS pos_point_users_tbl (
      pos_point_id INTEGER NOT NULL REFERENCES pos_points_tbl(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES user_settings(user_id) NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (pos_point_id, user_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS pos_sessions_tbl (
      id BIGSERIAL PRIMARY KEY,
      shift_guid UUID NOT NULL DEFAULT gen_random_uuid(),
      pos_point_id INTEGER NOT NULL REFERENCES pos_points_tbl(id),
      user_id INTEGER REFERENCES user_settings(user_id) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      opening_cash NUMERIC(18,4) NOT NULL DEFAULT 0,
      expected_cash NUMERIC(18,4) NOT NULL DEFAULT 0,
      counted_cash NUMERIC(18,4),
      handover_amount NUMERIC(18,4),
      handover_to_user_id INTEGER REFERENCES user_settings(user_id),
      received_from_session_id BIGINT REFERENCES pos_sessions_tbl(id),
      notes TEXT,
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE pos_sessions_tbl ADD COLUMN IF NOT EXISTS shift_guid UUID DEFAULT gen_random_uuid()`
  await sql`UPDATE pos_sessions_tbl SET shift_guid=gen_random_uuid() WHERE shift_guid IS NULL`
  await sql`ALTER TABLE pos_sessions_tbl ALTER COLUMN shift_guid SET NOT NULL`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_sessions_shift_guid ON pos_sessions_tbl(shift_guid)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_open_session_user ON pos_sessions_tbl(pos_point_id, user_id) WHERE status = 'open'`
  await sql`CREATE TABLE IF NOT EXISTS pos_session_currencies_tbl (
    session_id BIGINT NOT NULL REFERENCES pos_sessions_tbl(id) ON DELETE CASCADE,
    currency_id INTEGER NOT NULL REFERENCES currency(id),
    opening_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
    expected_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
    handover_amount NUMERIC(18,4),
    rate_to_point NUMERIC(18,8) NOT NULL,
    PRIMARY KEY(session_id,currency_id)
  )`
  await sql`
    CREATE TABLE IF NOT EXISTS pos_cash_movements_tbl (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES pos_sessions_tbl(id) ON DELETE CASCADE,
      movement_type VARCHAR(24) NOT NULL,
      amount NUMERIC(18,4) NOT NULL,
      reference VARCHAR(120),
      note TEXT,
      user_id INTEGER REFERENCES user_settings(user_id) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE pos_cash_movements_tbl ADD COLUMN IF NOT EXISTS currency_id INTEGER REFERENCES currency(id)`
  await sql`ALTER TABLE pos_cash_movements_tbl ADD COLUMN IF NOT EXISTS currency_amount NUMERIC(18,4)`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS pos_point_id INTEGER`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS session_id BIGINT`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS reference VARCHAR(160)`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS due_date DATE`
  // بيانات جهاز الدفع (PinPad) لدفعات البطاقة — lib/pinpad.ts
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS card_entry VARCHAR(10)`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS pinpad_machine_id INTEGER`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS card_auth_code VARCHAR(40)`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS card_trans_id VARCHAR(60)`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS card_terminal_id VARCHAR(60)`
  await sql`ALTER TABLE pos_sale_payments_tbl ADD COLUMN IF NOT EXISTS card_merchant VARCHAR(120)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pos_point_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pos_session_id BIGINT`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS shift_guid UUID`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS campaign_discount_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS campaign_discount_id INTEGER`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS campaign_id INTEGER`
  await sql`UPDATE voucher_header_tbl vh SET shift_guid=s.shift_guid FROM pos_sessions_tbl s WHERE vh.pos_session_id=s.id AND vh.shift_guid IS NULL`
  await sql`UPDATE voucher_header_tbl vh SET shift_guid=s.shift_guid FROM pos_sale_payments_tbl p JOIN pos_sessions_tbl s ON s.id=p.session_id WHERE p.voucher_id=vh.id AND vh.shift_guid IS NULL`
  await sql`
    CREATE TABLE IF NOT EXISTS pos_gift_cards_tbl (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(80) NOT NULL UNIQUE,
      currency_id INTEGER NOT NULL,
      balance NUMERIC(18,4) NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,
      expires_at DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS pos_sale_drafts_tbl (
      id BIGSERIAL PRIMARY KEY,
      draft_code VARCHAR(40) NOT NULL UNIQUE,
      pos_point_id INTEGER NOT NULL REFERENCES pos_points_tbl(id),
      pos_session_id BIGINT REFERENCES pos_sessions_tbl(id),
      user_id INTEGER NOT NULL REFERENCES user_settings(user_id),
      customer_id INTEGER,
      salesman_id INTEGER,
      mode VARCHAR(12) NOT NULL DEFAULT 'sale',
      note TEXT,
      discount_value NUMERIC(12,4) NOT NULL DEFAULT 0,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE pos_points_tbl ALTER COLUMN cash_account_id DROP NOT NULL`
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS return_account_id INTEGER`
  // ايميل مدير النظام + ايميل المسؤول: يستلمان رمز التفعيل عند طلب صلاحية غير ممنوحة (lib/permission-approvals.ts)
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS admin_email VARCHAR(150)`
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS manager_email VARCHAR(150)`
  // جوال مدير النظام + جوال المسؤول: إرسال رمز التفعيل عبر واتساب
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS admin_mobile VARCHAR(30)`
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS manager_mobile VARCHAR(30)`
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS item_grouping_mode VARCHAR(16) NOT NULL DEFAULT 'on_entry' CHECK (item_grouping_mode IN ('none', 'on_entry', 'on_print'))`
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS print_by_item_group BOOLEAN NOT NULL DEFAULT FALSE`
  // عهدة الدخان (lib/pos-tobacco.ts): كميات أصناف الدخان تُستلم عند فتح العهدة وتُسلَّم قبل تسليمها
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS tobacco_custody BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tobacco BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`CREATE TABLE IF NOT EXISTS pos_tobacco_custody_tbl (
    session_id BIGINT NOT NULL REFERENCES pos_sessions_tbl(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    opening_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
    sold_qty NUMERIC(18,4),
    expected_qty NUMERIC(18,4),
    counted_qty NUMERIC(18,4),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    handed_over_at TIMESTAMPTZ,
    PRIMARY KEY (session_id, product_id)
  )`
  await sql`ALTER TABLE pos_sessions_tbl ADD COLUMN IF NOT EXISTS tobacco_opened BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`ALTER TABLE pos_sessions_tbl ADD COLUMN IF NOT EXISTS tobacco_handed_over BOOLEAN NOT NULL DEFAULT FALSE`
  // الكاشير ألغى استلام عهدة الدخان لهذه الوردية (لا عهدة دخان معه) — لا نافذة استلام ولا تسليم
  await sql`ALTER TABLE pos_sessions_tbl ADD COLUMN IF NOT EXISTS tobacco_skipped BOOLEAN NOT NULL DEFAULT FALSE`
  // طابعة مجموعة الأصناف: تُطبع عليها أصناف المجموعة (الاسم والكمية) عند حفظ فاتورة الكاشير مع print_by_item_group
  await sql`ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS default_printer VARCHAR(150)`
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS print_invoices BOOLEAN NOT NULL DEFAULT FALSE`
  // طباعة الفواتير: 0 عدم الطباعة، 1 فاتورة كاملة، 2 فاتورة QR فقط (رمز يحمل كل بيانات الفاتورة).
  // print_invoices يبقى (= الوضع > 0) لتوافق النسخ/البيانات القديمة؛ النقاط القائمة تُرحَّل منه مرة واحدة.
  await sql`ALTER TABLE pos_points_tbl ADD COLUMN IF NOT EXISTS invoice_print_mode SMALLINT`
  await sql`UPDATE pos_points_tbl SET invoice_print_mode = CASE WHEN print_invoices THEN 1 ELSE 0 END WHERE invoice_print_mode IS NULL`
  await sql`ALTER TABLE pos_points_tbl ALTER COLUMN invoice_print_mode SET DEFAULT 0`
  await sql`CREATE INDEX IF NOT EXISTS idx_pos_sale_drafts_owner ON pos_sale_drafts_tbl(pos_point_id,user_id,status,updated_at DESC)`
  await sql`
    CREATE TABLE IF NOT EXISTS pos_cashier_log_tbl (
      id BIGSERIAL PRIMARY KEY,
      occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      pos_point_id INTEGER REFERENCES pos_points_tbl(id),
      session_id BIGINT REFERENCES pos_sessions_tbl(id),
      user_id INTEGER REFERENCES user_settings(user_id),
      movement_type VARCHAR(40) NOT NULL,
      transaction_no VARCHAR(120),
      notes TEXT
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_pos_cashier_log_filters ON pos_cashier_log_tbl(occurred_at,pos_point_id,user_id,movement_type)`
  // فهارس استعلام أصناف الكاشير (/api/pos/catalog): رصيد كل صنف بمستودع النقطة، تقييد الصنف بمستودعات، وفئة
  // سعر العميل — بدونها يمسح الاستعلام الجداول كاملة لكل صنف (آلاف الأصناف).
  await sql`CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_warehouse ON inventory_transactions(product_id,warehouse_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_product_warehouses_product_warehouse ON product_warehouses(product_id,warehouse_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_customers_account_id ON customers(account_id)`
  // إحصاءات حديثة بعد استيراد آلاف الأصناف (كان المُخطِّط يقدّر 31 صنفاً بدل 16,603 فيختار خطة سيئة)
  await sql`ANALYZE products`
  await sql`ANALYZE product_units`
  await sql`ANALYZE product_prices`
  await sql`ANALYZE product_unit_barcodes`
  await sql`ANALYZE inventory_transactions`
}) }

export function requestUserId(request: Request) {
  return String(request.headers.get("x-user-id") || "").trim()
}

export function requestBranchId(request: Request) {
  const value = Number(request.headers.get("x-branch-id") || 0)
  return Number.isInteger(value) && value > 0 ? value : null
}

// صلاحية ممنوحة، أو موافقة لمرة برمز تفعيل من مدير النظام/المسؤول (ترويسة x-permission-approval — lib/permission-approvals.ts)
export async function canUsePosCashierPermission(userId: string, branchId: number, permission: PosCashierPermission) {
  if (await hasPosCashierPermission(userId, permission, branchId)) return true
  return hasPermissionApproval(userId, "pos", permission)
}

/** صلاحيات شاشات تعريف الكاشير (الحملات، بطاقات الخصم): مستخدم الجلسة على الفرع النشط (x-branch-id) أو فرعه الافتراضي. null = مسموح */
export async function requirePosDefinitionPermission(request: Request, permission: PosCashierPermission): Promise<NextResponse | null> {
  const { getSessionUser } = await import("@/lib/tenant-auth")
  const user = await getSessionUser(request as any)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  const branchId = requestBranchId(request) || Number((await sql`SELECT branch_id FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`)[0]?.branch_id) || 0
  if (await hasPosCashierPermission(String(user.user_id), permission, branchId)) return null
  return NextResponse.json({ error: `لا توجد لديك صلاحية ${POS_CASHIER_PERMISSIONS[permission]}` }, { status: 403 })
}

/** رد 403 لصلاحية كاشير غير ممنوحة — يحمل permission_required ليعرض المتصفح نافذة طلب رمز التفعيل */
export function posPermissionDenied(permission: PosCashierPermission, error?: string) {
  return NextResponse.json(permissionRequiredBody("pos", permission, error), { status: 403 })
}

export async function getPosPoint(pointId: number, userId: string, branchId?: number | null) {
  const rows = await sql`
    SELECT p.*, b.branch_name, w.warehouse_name, c.currency_name, c.currency_code,
           vb.name AS sales_book_name, rvb.name AS return_book_name
    FROM pos_points_tbl p
    LEFT JOIN branches b ON b.id=p.branch_id
    LEFT JOIN warehouses w ON w.id=p.main_warehouse_id
    LEFT JOIN currency c ON c.id=p.currency_id
    LEFT JOIN voucher_books_tbl vb ON vb.id=p.sales_book_id
    LEFT JOIN voucher_books_tbl rvb ON rvb.id=p.return_book_id
    WHERE p.id=${pointId} AND p.status=1
      AND (${branchId ?? 0}=0 OR p.branch_id=${branchId ?? 0})
      AND (NOT EXISTS (SELECT 1 FROM pos_point_users_tbl x WHERE x.pos_point_id=p.id)
           OR EXISTS (SELECT 1 FROM pos_point_users_tbl x WHERE x.pos_point_id=p.id AND x.user_id=${userId}))
    LIMIT 1
  `
  return rows[0] ? resolvePosAccounts(rows[0], userId) : null
}

export async function getOpenPosSession(pointId: number, userId: string) {
  const rows = await sql`
    SELECT * FROM pos_sessions_tbl
    WHERE pos_point_id=${pointId} AND user_id=${userId} AND status='open'
    ORDER BY id DESC LIMIT 1
  `
  return rows[0] || null
}
