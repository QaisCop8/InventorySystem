import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureWorkingPeriodGuard } from "@/lib/working-period"

// إقفال الفترات: GET القائمة + الفروع، POST إقفال فترة، PATCH فتح/إعادة إقفال/تعديل، DELETE حذف سجل مفتوح.
// الفرض الفعلي في Trigger السندات (lib/working-period.ts: period_lock_violation).
const isDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "period_lock", "view")
    if (!authorization.ok) return authorization.response
    await ensureWorkingPeriodGuard()
    const [rows, branches] = await Promise.all([
      sql`
        SELECT l.id, l.branch_id, b.branch_name, l.from_date::text from_date, l.to_date::text to_date, l.note, l.is_active,
          l.created_by, l.created_at, l.updated_by, l.updated_at,
          (SELECT COUNT(*)::int FROM voucher_header_tbl vh WHERE vh.status <> 3 AND vh.vch_date::date BETWEEN l.from_date AND l.to_date
             AND (l.branch_id IS NULL OR vh.branch_id = l.branch_id)) voucher_count
        FROM period_locks_tbl l LEFT JOIN branches b ON b.id = l.branch_id
        ORDER BY l.is_active DESC, l.to_date DESC, l.id DESC
      `,
      sql`SELECT id, branch_name name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
    ])
    return NextResponse.json({ rows, branches })
  } catch (error) {
    console.error("[period-locks] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل الفترات المقفلة" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "period_lock", "create")
    if (!authorization.ok) return authorization.response
    await ensureWorkingPeriodGuard()
    const data = await request.json().catch(() => ({}))
    if (!isDate(data.from_date) || !isDate(data.to_date)) return NextResponse.json({ error: "حدّد تاريخ بداية ونهاية الفترة" }, { status: 400 })
    if (String(data.to_date) < String(data.from_date)) return NextResponse.json({ error: "نهاية الفترة تسبق بدايتها" }, { status: 400 })
    const branchId = Number(data.branch_id) || null
    if (branchId && !(await sql`SELECT 1 FROM branches WHERE id = ${branchId}`).length) return NextResponse.json({ error: "الفرع غير موجود" }, { status: 400 })
    const duplicate = (await sql`
      SELECT id FROM period_locks_tbl WHERE is_active AND from_date = ${data.from_date}::date AND to_date = ${data.to_date}::date
        AND branch_id IS NOT DISTINCT FROM ${branchId}::int LIMIT 1
    `)[0]
    if (duplicate) return NextResponse.json({ error: "هذه الفترة مقفلة مسبقاً لنفس الفرع" }, { status: 409 })
    const created = (await sql`
      INSERT INTO period_locks_tbl (branch_id, from_date, to_date, note, is_active, created_by, updated_by)
      VALUES (${branchId}, ${data.from_date}, ${data.to_date}, ${String(data.note || "").slice(0, 500) || null}, true, ${String(authorization.userId)}, ${String(authorization.userId)})
      RETURNING id
    `)[0] as any
    return NextResponse.json({ id: Number(created.id) }, { status: 201 })
  } catch (error) {
    console.error("[period-locks] POST failed", error)
    return NextResponse.json({ error: "تعذر إقفال الفترة" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "period_lock", "update")
    if (!authorization.ok) return authorization.response
    await ensureWorkingPeriodGuard()
    const data = await request.json().catch(() => ({}))
    const id = Number(data.id)
    if (!id) return NextResponse.json({ error: "معرّف الفترة مطلوب" }, { status: 400 })
    if (data.is_active !== undefined && Object.keys(data).every((key) => key === "id" || key === "is_active")) {
      const updated = await sql`UPDATE period_locks_tbl SET is_active = ${data.is_active === true}, updated_by = ${String(authorization.userId)}, updated_at = NOW() WHERE id = ${id} RETURNING id`
      if (!updated.length) return NextResponse.json({ error: "الفترة غير موجودة" }, { status: 404 })
      return NextResponse.json({ success: true })
    }
    if (!isDate(data.from_date) || !isDate(data.to_date) || String(data.to_date) < String(data.from_date)) return NextResponse.json({ error: "تواريخ الفترة غير صالحة" }, { status: 400 })
    const updated = await sql`
      UPDATE period_locks_tbl SET branch_id = ${Number(data.branch_id) || null}, from_date = ${data.from_date}, to_date = ${data.to_date},
        note = ${String(data.note || "").slice(0, 500) || null}, updated_by = ${String(authorization.userId)}, updated_at = NOW()
      WHERE id = ${id} RETURNING id
    `
    if (!updated.length) return NextResponse.json({ error: "الفترة غير موجودة" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[period-locks] PATCH failed", error)
    return NextResponse.json({ error: "تعذر تحديث الفترة" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "period_lock", "delete")
    if (!authorization.ok) return authorization.response
    const id = Number(request.nextUrl.searchParams.get("id"))
    const row = (await sql`SELECT is_active FROM period_locks_tbl WHERE id = ${id}`)[0] as any
    if (!row) return NextResponse.json({ error: "الفترة غير موجودة" }, { status: 404 })
    if (row.is_active) return NextResponse.json({ error: "افتح الفترة أولاً قبل حذف سجلها" }, { status: 400 })
    await sql`DELETE FROM period_locks_tbl WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[period-locks] DELETE failed", error)
    return NextResponse.json({ error: "تعذر حذف الفترة" }, { status: 500 })
  }
}
