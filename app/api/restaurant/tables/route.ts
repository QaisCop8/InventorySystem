import { NextResponse, type NextRequest } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
import { ensureRestaurantTables, errorStatus } from "@/lib/restaurant"

const SHAPES = new Set(["square", "round", "rect"])
const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max)

function tableFields(data: any) {
  const seats = Math.trunc(Number(data.seats))
  return {
    seats: Number.isFinite(seats) && seats > 0 ? Math.min(seats, 99) : 4,
    shape: SHAPES.has(String(data.shape)) ? String(data.shape) : "square",
    sortOrder: Math.max(0, Math.trunc(Number(data.sort_order) || 0)),
    notes: text(data.notes, 300) || null,
    status: Number(data.status) === 2 ? 2 : 1,
  }
}

async function activeLocation(locationId: number) {
  return (await sql`SELECT id, branch_id FROM restaurant_locations_tbl WHERE id = ${locationId} AND status <> 3`)[0] || null
}

async function nameTaken(locationId: number, name: string, id: number) {
  return Boolean((await sql`
    SELECT 1 FROM restaurant_tables_tbl
    WHERE location_id = ${locationId} AND status <> 3 AND id <> ${id} AND LOWER(BTRIM(name)) = LOWER(${name})
    LIMIT 1
  `)[0])
}

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeFileRead(request, ["restaurant-tables"])
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    const locationId = Number(request.nextUrl.searchParams.get("location_id")) || 0
    const rows = await sql`
      SELECT t.*, l.name AS location_name, l.branch_id, b.branch_name,
             EXISTS (SELECT 1 FROM restaurant_order_tables_tbl ot WHERE ot.table_id = t.id AND ot.active) AS occupied
      FROM restaurant_tables_tbl t
      JOIN restaurant_locations_tbl l ON l.id = t.location_id AND l.status <> 3
      LEFT JOIN branches b ON b.id = l.branch_id
      WHERE t.status <> 3 AND (${locationId} = 0 OR t.location_id = ${locationId})
      ORDER BY l.sort_order, l.id, t.sort_order, t.id
    `
    return NextResponse.json(permission.lookupOnly ? projectFileLookup("restaurant-tables", rows) : rows)
  } catch (error) {
    console.error("restaurant tables GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الطاولات" }, { status: errorStatus(error) })
  }
}

/** إضافة طاولة واحدة، أو مجموعة متتالية (bulk: {prefix, from, to}) لنفس الموقع */
export async function POST(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "restaurant-tables", "create")
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    const data = await request.json()
    const locationId = Number(data.location_id)
    if (!(await activeLocation(locationId))) return NextResponse.json({ error: "اختر موقعاً صالحاً" }, { status: 400 })
    const fields = tableFields(data)
    if (data.bulk) {
      const from = Math.trunc(Number(data.from)), to = Math.trunc(Number(data.to))
      if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to < from) {
        return NextResponse.json({ error: "نطاق أرقام الطاولات غير صالح" }, { status: 400 })
      }
      if (to - from + 1 > 200) return NextResponse.json({ error: "الحد الأقصى 200 طاولة في المرة الواحدة" }, { status: 400 })
      const prefix = text(data.prefix, 30)
      const created = await withTenantTransaction(async () => {
        const rows: any[] = []
        let skipped = 0
        for (let n = from; n <= to; n++) {
          const name = `${prefix}${prefix && !prefix.endsWith(" ") ? " " : ""}${n}`.trim()
          if (await nameTaken(locationId, name, 0)) { skipped++; continue }
          rows.push((await sql`
            INSERT INTO restaurant_tables_tbl (location_id, name, seats, shape, sort_order, notes, status, created_by)
            VALUES (${locationId}, ${name}, ${fields.seats}, ${fields.shape}, ${n}, ${fields.notes}, ${fields.status}, ${permission.userId})
            RETURNING *
          `)[0])
        }
        return { rows, skipped }
      })
      return NextResponse.json({ created: created.rows.length, skipped: created.skipped, rows: created.rows }, { status: 201 })
    }
    const name = text(data.name, 50)
    if (!name) return NextResponse.json({ error: "اسم/رقم الطاولة مطلوب" }, { status: 400 })
    if (await nameTaken(locationId, name, 0)) return NextResponse.json({ error: "توجد طاولة بنفس الاسم في هذا الموقع" }, { status: 409 })
    const rows = await sql`
      INSERT INTO restaurant_tables_tbl (location_id, name, seats, shape, sort_order, notes, status, created_by)
      VALUES (${locationId}, ${name}, ${fields.seats}, ${fields.shape}, ${fields.sortOrder}, ${fields.notes}, ${fields.status}, ${permission.userId})
      RETURNING *
    `
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error) {
    console.error("restaurant tables POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الطاولة" }, { status: errorStatus(error) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "restaurant-tables", "update")
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    const data = await request.json()
    const id = Number(data.id)
    const current = Number.isInteger(id) && id > 0 ? (await sql`SELECT * FROM restaurant_tables_tbl WHERE id = ${id} AND status <> 3`)[0] : null
    if (!current) return NextResponse.json({ error: "الطاولة غير موجودة" }, { status: 404 })
    const locationId = Number(data.location_id) || Number(current.location_id)
    if (!(await activeLocation(locationId))) return NextResponse.json({ error: "اختر موقعاً صالحاً" }, { status: 400 })
    const name = text(data.name, 50)
    if (!name) return NextResponse.json({ error: "اسم/رقم الطاولة مطلوب" }, { status: 400 })
    if (await nameTaken(locationId, name, id)) return NextResponse.json({ error: "توجد طاولة بنفس الاسم في هذا الموقع" }, { status: 409 })
    const fields = tableFields(data)
    const occupied = (await sql`SELECT 1 FROM restaurant_order_tables_tbl WHERE table_id = ${id} AND active LIMIT 1`)[0]
    if (occupied && (locationId !== Number(current.location_id) || fields.status === 2)) {
      return NextResponse.json({ error: "لا يمكن نقل الطاولة لموقع آخر أو إيقافها وعليها طلب مفتوح" }, { status: 409 })
    }
    const rows = await sql`
      UPDATE restaurant_tables_tbl SET
        location_id = ${locationId}, name = ${name}, seats = ${fields.seats}, shape = ${fields.shape},
        sort_order = ${fields.sortOrder}, notes = ${fields.notes}, status = ${fields.status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("restaurant tables PUT", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تعديل الطاولة" }, { status: errorStatus(error) })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "restaurant-tables", "delete")
    if (!permission.ok) return permission.response
    await ensureRestaurantTables()
    const id = Number(request.nextUrl.searchParams.get("id"))
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "معرف الطاولة غير صالح" }, { status: 400 })
    const occupied = (await sql`SELECT 1 FROM restaurant_order_tables_tbl WHERE table_id = ${id} AND active LIMIT 1`)[0]
    if (occupied) return NextResponse.json({ error: "لا يمكن حذف طاولة عليها طلب مفتوح" }, { status: 409 })
    // حذف منطقي: الطلبات السابقة تبقى مرتبطة بالطاولة
    const rows = await sql`UPDATE restaurant_tables_tbl SET status = 3, updated_at = NOW() WHERE id = ${id} AND status <> 3 RETURNING id`
    if (!rows.length) return NextResponse.json({ error: "الطاولة غير موجودة" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("restaurant tables DELETE", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الطاولة" }, { status: errorStatus(error) })
  }
}
