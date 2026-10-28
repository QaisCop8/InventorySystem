import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
import { ensureRestaurantTables, errorStatus } from "@/lib/restaurant"
import { assertLicenseAllows, licenseErrorResponseBody } from "@/lib/company-license"

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max)
const optionalId = (value: unknown) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function nextCode() {
  const row = (await sql`
    SELECT COALESCE(MAX(CASE WHEN code ~ '^L[0-9]{1,8}$' THEN SUBSTRING(code FROM 2)::int ELSE 0 END), 0) + 1 AS next
    FROM restaurant_locations_tbl
  `)[0]
  return `L${String(Number(row?.next) || 1).padStart(3, "0")}`
}

/** فروع المستخدم (نفس قائمة مبدّل الفرع في رأس الصفحة): عضويات user_branches، وبلا عضويات = كل الفروع */
async function userBranches(userId: string) {
  const [branches, memberships] = await Promise.all([
    sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY id`,
    sql`SELECT branch_id FROM user_branches WHERE user_id::text = ${String(userId)}`,
  ])
  const allowed = new Set(memberships.map((row: any) => Number(row.branch_id)))
  return memberships.length ? branches.filter((row: any) => allowed.has(Number(row.id))) : branches
}

async function validate(data: any, id: number | null, userId: string) {
  const name = text(data.name, 100)
  const code = text(data.code, 20)
  const branchId = Number(data.branch_id)
  if (!name) return { error: "اسم الموقع مطلوب" }
  if (!code) return { error: "رقم الموقع مطلوب" }
  if (!Number.isInteger(branchId) || branchId <= 0) return { error: "الفرع مطلوب" }
  if (!(await userBranches(userId)).some((row: any) => Number(row.id) === branchId)) return { error: "الفرع غير صالح أو غير مسموح لك" }

  const warehouseId = optionalId(data.warehouse_id), currencyId = optionalId(data.currency_id)
  const priceCategoryId = optionalId(data.price_category_id), salesBookId = optionalId(data.sales_book_id)
  if (!warehouseId) return { error: "المستودع مطلوب" }
  if (!currencyId) return { error: "العملة مطلوبة" }
  if (!priceCategoryId) return { error: "فئة السعر مطلوبة" }
  if (!salesBookId) return { error: "دفتر فواتير البيع مطلوب" }
  const [warehouse, currency, priceCategory, book] = await Promise.all([
    sql`SELECT id FROM warehouses WHERE id = ${warehouseId} AND COALESCE(status, 1) <> 3`,
    sql`SELECT id FROM currency WHERE id = ${currencyId} AND COALESCE(is_active, true)`,
    sql`SELECT id FROM pricecategory WHERE id = ${priceCategoryId} AND COALESCE(status, 1) = 1`,
    sql`SELECT id FROM voucher_books_tbl WHERE id = ${salesBookId}`,
  ])
  if (!warehouse[0]) return { error: "المستودع غير صالح" }
  if (!currency[0]) return { error: "العملة غير صالحة" }
  if (!priceCategory[0]) return { error: "فئة السعر غير صالحة" }
  if (!book[0]) return { error: "دفتر فواتير البيع غير صالح" }

  const accounts: Record<string, number | null> = {}
  for (const key of ["cash_account_id", "walk_in_account_id", "card_account_id", "cheque_account_id", "tax_account_id"]) {
    const accountId = optionalId(data[key])
    if (accountId && !(await sql`SELECT id FROM account_tbl WHERE id = ${accountId} AND COALESCE(status, 1) <> 3`)[0]) return { error: "يوجد حساب غير صالح في إعدادات البيع" }
    accounts[key] = accountId
  }
  const maxDiscount = Number(data.max_discount_percent ?? 100)
  if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 100) return { error: "أعلى نسبة خصم يجب أن تكون بين 0 و100" }
  const printMode = [0, 1, 2].includes(Number(data.invoice_print_mode)) ? Number(data.invoice_print_mode) : 1

  const duplicate = (await sql`
    SELECT id FROM restaurant_locations_tbl
    WHERE status <> 3 AND id <> ${id ?? 0}
      AND (LOWER(code) = LOWER(${code}) OR (branch_id = ${branchId} AND LOWER(BTRIM(name)) = LOWER(${name})))
    LIMIT 1
  `)[0]
  if (duplicate) return { error: "يوجد موقع بنفس الرقم أو بنفس الاسم في هذا الفرع" }
  return {
    value: {
      name, code, branchId, warehouseId, currencyId, priceCategoryId, salesBookId, accounts, maxDiscount, printMode,
      printByGroup: data.print_by_item_group !== false,
      kitchenPrintConfirm: data.kitchen_print_confirm === true,
      status: Number(data.status) === 2 ? 2 : 1,
      sortOrder: Math.max(0, Math.trunc(Number(data.sort_order) || 0)),
      color: text(data.color, 20) || null,
      notes: text(data.notes, 500) || null,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureRestaurantTables()
    const params = request.nextUrl.searchParams
    if (params.get("options") === "1") {
      const permission = await authorizeFile(request, "restaurant-locations", "access")
      if (!permission.ok) return permission.response
      const [branches, warehouses, currencies, books, priceCategories, code] = await Promise.all([
        userBranches(permission.userId),
        sql`SELECT id, warehouse_code AS code, warehouse_name AS name FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY warehouse_name`,
        sql`SELECT id, currency_code AS code, currency_name AS name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
        sql`SELECT id, name FROM voucher_books_tbl ORDER BY name`,
        sql`SELECT id, name FROM pricecategory WHERE COALESCE(status, 1) = 1 ORDER BY id`,
        nextCode(),
      ])
      return NextResponse.json({ branches, warehouses, currencies, books, priceCategories, next_code: code })
    }
    // شاشة الطاولات تقرأ المواقع كقائمة اختيار (حقول مختصرة) لمن يملك صلاحيات الطاولات فقط
    const permission = await authorizeFileRead(request, ["restaurant-locations", "restaurant-tables"])
    if (!permission.ok) return permission.response
    const branchId = Number(params.get("branch_id")) || 0
    const rows = await sql`
      SELECT l.*, b.branch_name, w.warehouse_name, c.currency_code, pc.name AS price_category_name, vb.name AS sales_book_name,
             (SELECT COUNT(*)::int FROM restaurant_tables_tbl t WHERE t.location_id = l.id AND t.status <> 3) AS tables_count
      FROM restaurant_locations_tbl l
      LEFT JOIN branches b ON b.id = l.branch_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      LEFT JOIN currency c ON c.id = l.currency_id
      LEFT JOIN pricecategory pc ON pc.id = l.price_category_id
      LEFT JOIN voucher_books_tbl vb ON vb.id = l.sales_book_id
      WHERE l.status <> 3 AND (${branchId} = 0 OR l.branch_id = ${branchId})
      ORDER BY l.branch_id, l.sort_order, l.id
    `
    return NextResponse.json(permission.lookupOnly ? projectFileLookup("restaurant-locations", rows) : rows)
  } catch (error) {
    console.error("restaurant locations GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل المواقع" }, { status: errorStatus(error) })
  }
}

async function save(request: NextRequest, mode: "create" | "update") {
  const permission = await authorizeFile(request, "restaurant-locations", mode)
  if (!permission.ok) return permission.response
  await ensureRestaurantTables()
  const data = await request.json()
  const id = mode === "update" ? Number(data.id) : null
  let current: any = null
  if (mode === "update") {
    if (!Number.isInteger(id) || Number(id) <= 0) return NextResponse.json({ error: "معرف الموقع غير صالح" }, { status: 400 })
    current = (await sql`SELECT * FROM restaurant_locations_tbl WHERE id = ${id} AND status <> 3`)[0]
    if (!current) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
  } else {
    // ترخيص الشركة: عدد مواقع المطاعم المسموح به (0 افتراضياً للشركات الجديدة) — يُطلب رفعه/يُدفع من شاشة المواقع
    try { await assertLicenseAllows("restaurant_locations") } catch (licenseError) {
      const body = licenseErrorResponseBody(licenseError)
      if (body) return NextResponse.json(body, { status: 409 })
      throw licenseError
    }
    // رقم الموقع تلقائي دائماً — لا يُقبل من العميل
    data.code = await nextCode()
  }
  // رقم الموقع غير قابل للتعديل
  if (current) data.code = current.code
  const checked = await validate(data, id, permission.userId)
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
  const v = checked.value
  if (current && (v.branchId !== Number(current.branch_id) || v.status === 2)) {
    const open = (await sql`SELECT 1 FROM restaurant_orders_tbl WHERE location_id = ${id} AND status = 'open' LIMIT 1`)[0]
    if (open) return NextResponse.json({ error: "لا يمكن تغيير الفرع أو إيقاف الموقع وعليه طلبات مفتوحة" }, { status: 409 })
  }
  const a = v.accounts
  const rows = current
    ? await sql`
        UPDATE restaurant_locations_tbl SET
          code = ${v.code}, name = ${v.name}, branch_id = ${v.branchId}, warehouse_id = ${v.warehouseId}, currency_id = ${v.currencyId},
          price_category_id = ${v.priceCategoryId}, sales_book_id = ${v.salesBookId}, cash_account_id = ${a.cash_account_id},
          walk_in_account_id = ${a.walk_in_account_id}, card_account_id = ${a.card_account_id}, cheque_account_id = ${a.cheque_account_id},
          tax_account_id = ${a.tax_account_id}, max_discount_percent = ${v.maxDiscount}, invoice_print_mode = ${v.printMode},
          print_by_item_group = ${v.printByGroup}, kitchen_print_confirm = ${v.kitchenPrintConfirm}, sort_order = ${v.sortOrder}, color = ${v.color}, notes = ${v.notes}, status = ${v.status}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `
    : await sql`
        INSERT INTO restaurant_locations_tbl (
          code, name, branch_id, warehouse_id, currency_id, price_category_id, sales_book_id, cash_account_id, walk_in_account_id,
          card_account_id, cheque_account_id, tax_account_id, max_discount_percent, invoice_print_mode, print_by_item_group, kitchen_print_confirm,
          sort_order, color, notes, status, created_by
        ) VALUES (
          ${v.code}, ${v.name}, ${v.branchId}, ${v.warehouseId}, ${v.currencyId}, ${v.priceCategoryId}, ${v.salesBookId}, ${a.cash_account_id},
          ${a.walk_in_account_id}, ${a.card_account_id}, ${a.cheque_account_id}, ${a.tax_account_id}, ${v.maxDiscount}, ${v.printMode},
          ${v.printByGroup}, ${v.kitchenPrintConfirm}, ${v.sortOrder}, ${v.color}, ${v.notes}, ${v.status}, ${permission.userId}
        )
        RETURNING *
      `
  return NextResponse.json(rows[0], { status: current ? 200 : 201 })
}

export async function POST(request: NextRequest) {
  try {
    return await save(request, "create")
  } catch (error) {
    console.error("restaurant locations POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الموقع" }, { status: errorStatus(error) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    return await save(request, "update")
  } catch (error) {
    console.error("restaurant locations PUT", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تعديل الموقع" }, { status: errorStatus(error) })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "restaurant-locations", "delete")
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    const id = Number(request.nextUrl.searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "معرف الموقع غير صالح" }, { status: 400 })
    const tables = (await sql`SELECT COUNT(*)::int AS n FROM restaurant_tables_tbl WHERE location_id = ${id} AND status <> 3`)[0]
    if (Number(tables?.n) > 0) {
      return NextResponse.json({ error: `لا يمكن حذف الموقع لوجود ${tables.n} طاولة معرّفة عليه؛ احذف الطاولات أولاً` }, { status: 409 })
    }
    const open = (await sql`SELECT 1 FROM restaurant_orders_tbl WHERE location_id = ${id} AND status = 'open' LIMIT 1`)[0]
    if (open) return NextResponse.json({ error: "لا يمكن حذف موقع عليه طلبات سفري مفتوحة" }, { status: 409 })
    const rows = await sql`UPDATE restaurant_locations_tbl SET status = 3, updated_at = NOW() WHERE id = ${id} AND status <> 3 RETURNING id`
    if (!rows.length) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("restaurant locations DELETE", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الموقع" }, { status: errorStatus(error) })
  }
}
