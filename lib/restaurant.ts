import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { ensureNamedPermission, LEGACY_FULL_ACCESS_SQL } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { resolvePosAccounts } from "@/lib/pos-accounts"
import {
  RESTAURANT_PERMISSION_CATEGORY,
  RESTAURANT_PERMISSIONS,
  type RestaurantPermission,
} from "@/lib/transaction-permission-definitions"

// المطاعم: المواقع (صالات/طوابق، لكل موقع فرع ونقطة بيع للدفع) ← الطاولات ← طلب مفتوح واحد يحمل طاولة أو أكثر
// (الدمج = عدة طاولات نشطة على نفس الطلب). الطلب السفري (order_type='takeaway') بلا طاولات، يتبع موقعاً (لنقطة البيع)
// ويمكن تحويله لطاولة بالنقل. الأصناف تحمل الكمية والمدفوع منها: الدفع الجزئي يُصدر فاتورة كاشير
// لجزء من الكميات ويبقى الطلب مفتوحاً حتى تُدفع كلها. الطاولة مشغولة ⇔ صف نشط لها في restaurant_order_tables_tbl.

export const ORDER_STATUS = { open: "open", paid: "paid", cancelled: "cancelled", merged: "merged" } as const

export async function ensureRestaurantTables() {
  return runSchemaOnce("lib/restaurant.ts#ensureRestaurantTables", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_locations_tbl (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        branch_id INTEGER NOT NULL,
        pos_point_id INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        color VARCHAR(20),
        notes TEXT,
        status INTEGER NOT NULL DEFAULT 1,
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    // إعدادات البيع الخاصة بالموقع (مستقلة عن نقاط بيع الكاشير): منها الأصناف والأسعار ودفتر الفاتورة وحسابات الدفع
    for (const column of [
      "warehouse_id INTEGER", "currency_id INTEGER", "price_category_id INTEGER", "sales_book_id INTEGER",
      "cash_account_id INTEGER", "walk_in_account_id INTEGER", "card_account_id INTEGER", "cheque_account_id INTEGER", "tax_account_id INTEGER",
      "max_discount_percent NUMERIC(7,3) NOT NULL DEFAULT 100", "invoice_print_mode INTEGER NOT NULL DEFAULT 1", "print_by_item_group BOOLEAN NOT NULL DEFAULT TRUE", "kitchen_print_confirm BOOLEAN NOT NULL DEFAULT FALSE",
    ]) await sql.unsafe(`ALTER TABLE restaurant_locations_tbl ADD COLUMN IF NOT EXISTS ${column}`)
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS restaurant_locations_code_uq ON restaurant_locations_tbl (LOWER(code)) WHERE status <> 3`
    await sql`CREATE INDEX IF NOT EXISTS restaurant_locations_branch_idx ON restaurant_locations_tbl (branch_id)`
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_tables_tbl (
        id SERIAL PRIMARY KEY,
        location_id INTEGER NOT NULL REFERENCES restaurant_locations_tbl(id),
        name VARCHAR(50) NOT NULL,
        seats INTEGER NOT NULL DEFAULT 4,
        shape VARCHAR(10) NOT NULL DEFAULT 'square',
        sort_order INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        status INTEGER NOT NULL DEFAULT 1,
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_name_uq ON restaurant_tables_tbl (location_id, LOWER(name)) WHERE status <> 3`
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_orders_tbl (
        id SERIAL PRIMARY KEY,
        order_no VARCHAR(30),
        branch_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'open',
        order_type VARCHAR(12) NOT NULL DEFAULT 'dine_in',
        takeaway_name VARCHAR(100),
        guests INTEGER NOT NULL DEFAULT 1,
        customer_id INTEGER,
        discount_percent NUMERIC(7,3) NOT NULL DEFAULT 0,
        note TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        merged_into_order_id INTEGER,
        cancel_reason TEXT,
        opened_by VARCHAR(50),
        closed_by VARCHAR(50),
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`ALTER TABLE restaurant_orders_tbl ADD COLUMN IF NOT EXISTS order_type VARCHAR(12) NOT NULL DEFAULT 'dine_in'`
    await sql`ALTER TABLE restaurant_orders_tbl ADD COLUMN IF NOT EXISTS takeaway_name VARCHAR(100)`
    await sql`CREATE INDEX IF NOT EXISTS restaurant_orders_open_idx ON restaurant_orders_tbl (branch_id, status)`
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_order_tables_tbl (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES restaurant_orders_tbl(id),
        table_id INTEGER NOT NULL REFERENCES restaurant_tables_tbl(id),
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ
      )
    `
    // طاولة واحدة لا تكون على طلبين مفتوحين في نفس الوقت (حماية من سباق مستخدمين يفتحانها معاً)
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS restaurant_order_tables_active_uq ON restaurant_order_tables_tbl (table_id) WHERE active`
    await sql`CREATE INDEX IF NOT EXISTS restaurant_order_tables_order_idx ON restaurant_order_tables_tbl (order_id)`
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_order_items_tbl (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES restaurant_orders_tbl(id),
        product_id INTEGER NOT NULL,
        product_code VARCHAR(50),
        product_name VARCHAR(200),
        unit_id INTEGER,
        unit_name VARCHAR(50),
        price NUMERIC(18,4) NOT NULL DEFAULT 0,
        quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
        paid_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
        discount NUMERIC(7,3) NOT NULL DEFAULT 0,
        note TEXT,
        added_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS restaurant_order_items_order_idx ON restaurant_order_items_tbl (order_id)`
    // الإضافات المختارة للسطر من "المتغيرات والخصائص" في تعريف الصنف: [{group, value}] — تُطبع في قسيمة المطبخ
    await sql`ALTER TABLE restaurant_order_items_tbl ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::jsonb`
    // أعمدة الصنف التي تقرؤها شاشة المطعم (تُنشئها عادةً مسارات الأصناف)
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '[]'::jsonb`
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS related_items_mode INTEGER NOT NULL DEFAULT 1`
    await sql`CREATE TABLE IF NOT EXISTS product_related_items (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, related_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, UNIQUE(product_id, related_id), CHECK (product_id <> related_id))`
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_order_payments_tbl (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES restaurant_orders_tbl(id),
        voucher_id INTEGER,
        vch_code VARCHAR(50),
        amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        lines JSONB NOT NULL DEFAULT '[]'::jsonb,
        user_id VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_order_log_tbl (
        id SERIAL PRIMARY KEY,
        order_id INTEGER,
        action VARCHAR(30) NOT NULL,
        details JSONB,
        user_id VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  })
}

type Denied = { ok: false; response: NextResponse }
export type RestaurantAuth = { ok: true; userId: string; branchId: number; permissions: Record<RestaurantPermission, boolean> }

const deny = (error: string, status: number): Denied => ({ ok: false, response: NextResponse.json({ error }, { status }) })

/** صلاحيات المطعم الفعّالة للمستخدم على فرع — نفس ترتيب أولوية hasEffectivePermission (فرعي → مستخدم → دور → كامل الصلاحيات). */
export async function restaurantPermissionsFor(userId: string, branchId: number): Promise<Record<RestaurantPermission, boolean>> {
  const keys = Object.keys(RESTAURANT_PERMISSIONS) as RestaurantPermission[]
  const ids: number[] = []
  for (const key of keys) ids.push(await ensureNamedPermission(RESTAURANT_PERMISSIONS[key], RESTAURANT_PERMISSION_CATEGORY))
  const rows = await sql`
    SELECT a.id, COALESCE(ubp.is_granted, ua.is_granted, rbp.is_granted, rp.is_granted, ${sql.unsafe(LEGACY_FULL_ACCESS_SQL)}) AS is_granted
    FROM unnest(${ids}::int[]) AS a(id)
    CROSS JOIN (SELECT user_id, job_role_id, permissions FROM user_settings WHERE user_id = ${userId} LIMIT 1) us
    LEFT JOIN user_branch_permissions ubp ON ubp.user_id = us.user_id AND ubp.branch_id = ${branchId} AND ubp.access_id = a.id
    LEFT JOIN user_access ua ON ua.user_id = us.user_id AND ua.access_id = a.id
    LEFT JOIN role_branch_permissions rbp ON rbp.role_id = us.job_role_id AND rbp.branch_id = ${branchId} AND rbp.access_id = a.id
    LEFT JOIN role_permissions rp ON rp.role_id = us.job_role_id AND rp.access_id = a.id
  `
  const granted = new Map<number, boolean>(rows.map((row: any) => [Number(row.id), row.is_granted === true]))
  const access = granted.get(ids[0]) === true
  return Object.fromEntries(keys.map((key, index) => [key, access && granted.get(ids[index]) === true])) as Record<RestaurantPermission, boolean>
}

/**
 * يتحقق من المستخدم وفرع العمل (عضوية user_branches) وصلاحيات المطعم المطلوبة على ذلك الفرع.
 * branchValue = فرع الموقع/الطلب الذي تُنفَّذ عليه العملية؛ بدونه يُستخدم الفرع النشط (x-branch-id) ثم الافتراضي.
 */
export async function authorizeRestaurant(
  request: NextRequest,
  required: RestaurantPermission[],
  branchValue?: unknown,
): Promise<RestaurantAuth | Denied> {
  const user = await getSessionUser(request)
  if (!user) return deny("يجب تسجيل الدخول", 401)
  await ensureRestaurantTables()
  const userRow = (await sql`SELECT branch_id FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`)[0]
  const requested = Number(branchValue ?? request.headers.get("x-branch-id"))
  const branchId = Number.isInteger(requested) && requested > 0 ? requested : Number(userRow?.branch_id)
  if (!Number.isInteger(branchId) || branchId <= 0) return deny("يجب تحديد الفرع", 400)
  const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
  if (memberships.length && !memberships.some((row: any) => Number(row.branch_id) === branchId)) {
    return deny("المستخدم غير مخول للعمل على هذا الفرع", 403)
  }
  const permissions = await restaurantPermissionsFor(user.user_id, branchId)
  for (const key of ["access", ...required] as RestaurantPermission[]) {
    if (!permissions[key]) return deny(`لا توجد لديك صلاحية ${RESTAURANT_PERMISSIONS[key]} على هذا الفرع`, 403)
  }
  return { ok: true, userId: user.user_id, branchId, permissions }
}

export async function logRestaurant(orderId: number | null, action: string, details: unknown, userId: string) {
  await sql`INSERT INTO restaurant_order_log_tbl (order_id, action, details, user_id) VALUES (${orderId}, ${action}, ${JSON.stringify(details ?? {})}::jsonb, ${userId})`
}

const num = (value: unknown) => Number(value) || 0
const round2 = (value: number) => Math.round(value * 100) / 100

export function remainingQuantity(item: any) {
  return Math.max(0, Math.round((num(item.quantity) - num(item.paid_quantity)) * 10000) / 10000)
}

/** صافي سطر بعد خصم الصنف (الأسعار شاملة الضريبة كما في الكاشير) */
export function lineNet(price: number, quantity: number, discount: number) {
  return round2(price * quantity * (1 - discount / 100))
}

export async function loadOrder(orderId: number) {
  const order = (await sql`
    SELECT o.*, l.name AS location_name, l.pos_point_id, b.branch_name,
           COALESCE(a.name, '') AS customer_name
    FROM restaurant_orders_tbl o
    JOIN restaurant_locations_tbl l ON l.id = o.location_id
    LEFT JOIN branches b ON b.id = o.branch_id
    LEFT JOIN account_tbl a ON a.id = o.customer_id
    WHERE o.id = ${orderId}
    LIMIT 1
  `)[0]
  if (!order) return null
  const [tables, items, payments] = await Promise.all([
    sql`
      SELECT ot.table_id, ot.is_primary, t.name, t.seats, t.location_id, l.name AS location_name
      FROM restaurant_order_tables_tbl ot
      JOIN restaurant_tables_tbl t ON t.id = ot.table_id
      JOIN restaurant_locations_tbl l ON l.id = t.location_id
      WHERE ot.order_id = ${orderId} AND ot.active
      ORDER BY ot.is_primary DESC, t.sort_order, t.id
    `,
    sql`SELECT * FROM restaurant_order_items_tbl WHERE order_id = ${orderId} ORDER BY id`,
    sql`SELECT id, voucher_id, vch_code, amount, lines, user_id, created_at FROM restaurant_order_payments_tbl WHERE order_id = ${orderId} ORDER BY id`,
  ])
  const normalizedItems = items.map((item: any) => ({
    ...item,
    price: num(item.price),
    quantity: num(item.quantity),
    paid_quantity: num(item.paid_quantity),
    discount: num(item.discount),
    remaining_quantity: remainingQuantity(item),
  }))
  const gross = normalizedItems.reduce((sum: number, item: any) => sum + lineNet(item.price, item.quantity, item.discount), 0)
  const remaining = normalizedItems.reduce((sum: number, item: any) => sum + lineNet(item.price, item.remaining_quantity, item.discount), 0)
  const paid = payments.reduce((sum: number, row: any) => sum + num(row.amount), 0)
  return {
    ...order,
    discount_percent: num(order.discount_percent),
    tables,
    items: normalizedItems,
    payments: payments.map((row: any) => ({ ...row, amount: num(row.amount) })),
    totals: { gross: round2(gross), remaining: round2(remaining), paid: round2(paid) },
  }
}

/** يقفل الطلب لتعديله ويتحقق أنه مفتوح؛ يُستدعى داخل withTenantTransaction. */
export async function lockOpenOrder(orderId: number) {
  const row = (await sql`SELECT * FROM restaurant_orders_tbl WHERE id = ${orderId} FOR UPDATE`)[0]
  if (!row) throw Object.assign(new Error("الطلب غير موجود"), { status: 404 })
  if (row.status !== ORDER_STATUS.open) throw Object.assign(new Error("الطلب لم يعد مفتوحاً؛ حدّث الشاشة"), { status: 409 })
  return row
}

export async function touchOrder(orderId: number) {
  await sql`UPDATE restaurant_orders_tbl SET revision = revision + 1, updated_at = NOW() WHERE id = ${orderId}`
}

export async function releaseOrderTables(orderId: number) {
  await sql`UPDATE restaurant_order_tables_tbl SET active = FALSE, released_at = NOW() WHERE order_id = ${orderId} AND active`
}

/** طاولة صالحة (غير محذوفة، موقعها نشط) مع فرعها والطلب المفتوح عليها إن وُجد */
export async function tableWithState(tableId: number) {
  return (await sql`
    SELECT t.id, t.name, t.location_id, t.status, l.branch_id, l.status AS location_status, ot.order_id
    FROM restaurant_tables_tbl t
    JOIN restaurant_locations_tbl l ON l.id = t.location_id
    LEFT JOIN restaurant_order_tables_tbl ot ON ot.table_id = t.id AND ot.active
    WHERE t.id = ${tableId}
    LIMIT 1
  `)[0] || null
}

/**
 * إعدادات البيع للموقع بصيغة "نقطة بيع" يفهمها محرك البيع (app/api/pos/_sale-core.ts) وكتالوج الأصناف — بلا أي
 * نقطة بيع كاشير. الحسابات الفارغة تُكمَّل كالكاشير: حسابات المستخدم الافتراضية للعملة ثم حسابات النظام.
 */
export async function locationSalePoint(location: any, userId: string) {
  const missing = [
    [location.warehouse_id, "المستودع"], [location.currency_id, "العملة"],
    [location.price_category_id, "فئة السعر"], [location.sales_book_id, "دفتر فواتير البيع"],
  ].filter(([value]) => !(Number(value) > 0)).map(([, label]) => label)
  if (missing.length) {
    throw Object.assign(new Error(`أكمل إعدادات البيع للموقع "${location.name}" من شاشة المواقع: ${missing.join("، ")}`), { status: 400 })
  }
  const currency = (await sql`SELECT currency_code, currency_name FROM currency WHERE id = ${Number(location.currency_id)}`)[0]
  const printMode = Number(location.invoice_print_mode ?? 1)
  return resolvePosAccounts({
    name: location.name,
    branch_id: Number(location.branch_id),
    main_warehouse_id: Number(location.warehouse_id),
    currency_id: Number(location.currency_id),
    currency_code: currency?.currency_code || "",
    currency_name: currency?.currency_name || "",
    price_category_id: Number(location.price_category_id),
    sales_book_id: Number(location.sales_book_id),
    return_book_id: null,
    cash_account_id: Number(location.cash_account_id) || null,
    walk_in_account_id: Number(location.walk_in_account_id) || null,
    card_account_id: Number(location.card_account_id) || null,
    cheque_account_id: Number(location.cheque_account_id) || null,
    gift_account_id: null,
    tax_account_id: Number(location.tax_account_id) || null,
    return_account_id: null,
    max_discount_percent: Number(location.max_discount_percent ?? 100),
    allow_returns: false,
    allow_gifts: false,
    invoice_print_mode: printMode,
    print_invoices: printMode > 0,
    print_by_item_group: location.print_by_item_group !== false,
    // "اظهار رسالة طباعة عند ارسال الطلب الى المطبخ" — يسأل قبل طباعة قسائم المطبخ
    kitchen_print_confirm: location.kitchen_print_confirm === true,
  }, userId)
}

/** إضافات السطر: مصفوفة {group, value} نظيفة (حد 30 إضافة، 80 حرفاً لكل قيمة) */
export function cleanAddons(input: unknown): { group: string; value: string }[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const rows: { group: string; value: string }[] = []
  for (const entry of input.slice(0, 30)) {
    const group = String((entry as any)?.group ?? "").trim().slice(0, 80)
    const value = String((entry as any)?.value ?? entry ?? "").trim().slice(0, 80)
    const key = `${group} ${value}`
    if (!value || seen.has(key)) continue
    seen.add(key)
    rows.push({ group, value })
  }
  return rows
}

/**
 * كل صنف له "المتغيرات والخصائص" يجب أن يُختار له قيمة واحدة على الأقل من كل مجموعة — يُفحص عند الإرسال للمطبخ
 * وعند الدفع. lines: [{product_id, product_name, addons}] — يرمي خطأ 400 برسالة جاهزة.
 */
export async function assertAddonsComplete(lines: { product_id: number; product_name?: string; addons?: unknown }[]) {
  const ids = [...new Set(lines.map((line) => Number(line.product_id)).filter((id) => id > 0))]
  if (!ids.length) return
  const rows = await sql`SELECT id, product_name, attributes FROM products WHERE id = ANY(${ids}::int[]) AND jsonb_typeof(attributes) = 'array'`
  const groupsById = new Map<number, { name: string; values: string[] }[]>()
  for (const row of rows as any[]) {
    const groups = (row.attributes as any[])
      .map((group) => ({ name: String(group?.name || "").trim(), values: (Array.isArray(group?.values) ? group.values : []).map((value: unknown) => String(value || "").trim()).filter(Boolean) }))
      .filter((group) => group.name && group.values.length)
    if (groups.length) groupsById.set(Number(row.id), groups)
  }
  for (const line of lines) {
    const groups = groupsById.get(Number(line.product_id))
    if (!groups) continue
    const addons = cleanAddons(line.addons)
    const missing = groups.filter((group) => !addons.some((addon) => addon.group === group.name && group.values.includes(addon.value))).map((group) => group.name)
    if (missing.length) {
      throw Object.assign(new Error(`اختر إضافات الصنف "${line.product_name || ""}": ${missing.join("، ")}`), { status: 400 })
    }
  }
}

export function errorStatus(error: unknown) {
  return Number((error as { status?: number })?.status) || 500
}
