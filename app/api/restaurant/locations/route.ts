import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
import { ensureRestaurantTables, errorStatus } from "@/lib/restaurant"
import { ensurePosTables } from "@/app/api/pos/_lib"

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max)

async function nextCode() {
  const row = (await sql`
    SELECT COALESCE(MAX(CASE WHEN code ~ '^L[0-9]{1,8}$' THEN SUBSTRING(code FROM 2)::int ELSE 0 END), 0) + 1 AS next
    FROM restaurant_locations_tbl
  `)[0]
  return `L${String(Number(row?.next) || 1).padStart(3, "0")}`
}

async function validate(data: any, id: number | null) {
  const name = text(data.name, 100)
  const code = text(data.code, 20)
  const branchId = Number(data.branch_id)
  const posPointId = Number(data.pos_point_id) || null
  if (!name) return { error: "اسم الموقع مطلوب" }
  if (!code) return { error: "رمز الموقع مطلوب" }
  if (!Number.isInteger(branchId) || branchId <= 0) return { error: "الفرع مطلوب" }
  const branch = (await sql`SELECT id FROM branches WHERE id = ${branchId} AND COALESCE(status, 1) <> 3 AND bank_id IS NULL`)[0]
  if (!branch) return { error: "الفرع غير صالح" }
  if (posPointId) {
    const point = (await sql`SELECT branch_id FROM pos_points_tbl WHERE id = ${posPointId} AND status = 1`)[0]
    if (!point) return { error: "نقطة البيع غير صالحة أو غير نشطة" }
    if (Number(point.branch_id) !== branchId) return { error: "نقطة البيع يجب أن تتبع نفس فرع الموقع" }
  }
  const duplicate = (await sql`
    SELECT id FROM restaurant_locations_tbl
    WHERE status <> 3 AND id <> ${id ?? 0}
      AND (LOWER(code) = LOWER(${code}) OR (branch_id = ${branchId} AND LOWER(BTRIM(name)) = LOWER(${name})))
    LIMIT 1
  `)[0]
  if (duplicate) return { error: "يوجد موقع بنفس الرمز أو بنفس الاسم في هذا الفرع" }
  const status = Number(data.status) === 2 ? 2 : 1
  return {
    value: {
      name, code, branchId, posPointId, status,
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
      await ensurePosTables()
      const [branches, points, code] = await Promise.all([
        sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) <> 3 AND bank_id IS NULL ORDER BY id`,
        sql`SELECT id, code, name, branch_id FROM pos_points_tbl WHERE status = 1 ORDER BY name`,
        nextCode(),
      ])
      return NextResponse.json({ branches, points, next_code: code })
    }
    // شاشة الطاولات تقرأ المواقع كقائمة اختيار (حقول مختصرة) لمن يملك صلاحيات الطاولات فقط
    const permission = await authorizeFileRead(request, ["restaurant-locations", "restaurant-tables"])
    if (!permission.ok) return permission.response
    const branchId = Number(params.get("branch_id")) || 0
    const rows = await sql`
      SELECT l.*, b.branch_name, p.name AS pos_point_name,
             (SELECT COUNT(*)::int FROM restaurant_tables_tbl t WHERE t.location_id = l.id AND t.status <> 3) AS tables_count
      FROM restaurant_locations_tbl l
      LEFT JOIN branches b ON b.id = l.branch_id
      LEFT JOIN pos_points_tbl p ON p.id = l.pos_point_id
      WHERE l.status <> 3 AND (${branchId} = 0 OR l.branch_id = ${branchId})
      ORDER BY l.branch_id, l.sort_order, l.id
    `
    return NextResponse.json(permission.lookupOnly ? projectFileLookup("restaurant-locations", rows) : rows)
  } catch (error) {
    console.error("restaurant locations GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل المواقع" }, { status: errorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "restaurant-locations", "create")
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    await ensurePosTables()
    const data = await request.json()
    if (!text(data.code, 20)) data.code = await nextCode()
    const checked = await validate(data, null)
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
    const v = checked.value
    const rows = await sql`
      INSERT INTO restaurant_locations_tbl (code, name, branch_id, pos_point_id, sort_order, color, notes, status, created_by)
      VALUES (${v.code}, ${v.name}, ${v.branchId}, ${v.posPointId}, ${v.sortOrder}, ${v.color}, ${v.notes}, ${v.status}, ${permission.userId})
      RETURNING *
    `
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error) {
    console.error("restaurant locations POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الموقع" }, { status: errorStatus(error) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "restaurant-locations", "update")
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    await ensurePosTables()
    const data = await request.json()
    const id = Number(data.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "معرف الموقع غير صالح" }, { status: 400 })
    const current = (await sql`SELECT * FROM restaurant_locations_tbl WHERE id = ${id} AND status <> 3`)[0]
    if (!current) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
    const checked = await validate(data, id)
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
    const v = checked.value
    if (v.branchId !== Number(current.branch_id) || v.status === 2) {
      const open = (await sql`SELECT 1 FROM restaurant_orders_tbl WHERE location_id = ${id} AND status = 'open' LIMIT 1`)[0]
      if (open) return NextResponse.json({ error: "لا يمكن تغيير الفرع أو إيقاف الموقع وعليه طاولات مفتوحة" }, { status: 409 })
    }
    const rows = await sql`
      UPDATE restaurant_locations_tbl SET
        code = ${v.code}, name = ${v.name}, branch_id = ${v.branchId}, pos_point_id = ${v.posPointId},
        sort_order = ${v.sortOrder}, color = ${v.color}, notes = ${v.notes}, status = ${v.status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return NextResponse.json(rows[0])
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
    const rows = await sql`UPDATE restaurant_locations_tbl SET status = 3, updated_at = NOW() WHERE id = ${id} AND status <> 3 RETURNING id`
    if (!rows.length) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("restaurant locations DELETE", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الموقع" }, { status: errorStatus(error) })
  }
}
