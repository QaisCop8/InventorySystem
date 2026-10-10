import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAttendanceSchema } from "@/lib/attendance-engine"

// قوالب الورديات (صباحية/مسائية/ليلية/مناوبة...) بالحقول الكاملة: اللون، النوع، الاستراحة، فترة السماح،
// الوردية الليلية الممتدة لليوم التالي، وحد احتساب العمل الإضافي.

const time = (value: unknown, fallback: string) => (/^\d{2}:\d{2}/.test(String(value || "")) ? String(value).slice(0, 5) : fallback)

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    return NextResponse.json(await sql`
      SELECT id, code, name, start_time::text AS start_time, end_time::text AS end_time, break_minutes, grace_minutes, is_overnight,
        COALESCE(color, '#0d9488') AS color, COALESCE(shift_kind, 'day') AS shift_kind, COALESCE(overtime_after_minutes, 15) AS overtime_after_minutes, is_active
      FROM shift_definitions_tbl ORDER BY start_time, name
    `)
  } catch (error) {
    console.error("Shift templates GET error:", error)
    return NextResponse.json({ error: "تعذر تحميل الورديات" }, { status: 500 })
  }
}

async function save(request: NextRequest, update: boolean) {
  if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  await ensureAttendanceSchema()
  const body = await request.json().catch(() => ({}))
  const code = String(body.code || "").trim().toUpperCase()
  const name = String(body.name || "").trim()
  if (!code || !name) return NextResponse.json({ error: "رمز الوردية واسمها مطلوبان" }, { status: 400 })
  if (!/^[A-Z0-9_-]{1,10}$/.test(code)) return NextResponse.json({ error: "رمز الوردية أحرف إنجليزية وأرقام فقط (حتى 10) — يُستخدم في أنماط التدوير" }, { status: 400 })
  if (code === "OFF") return NextResponse.json({ error: "الرمز OFF محجوز ليوم الراحة" }, { status: 400 })
  const start = time(body.start_time, "08:00")
  const end = time(body.end_time, "16:00")
  const overnight = Boolean(body.is_overnight) || end <= start
  const values = {
    code, name, start, end, overnight,
    breakMinutes: Math.max(0, Number(body.break_minutes) || 0),
    grace: Math.max(0, Number(body.grace_minutes) || 0),
    color: /^#[0-9a-fA-F]{6}$/.test(String(body.color || "")) ? String(body.color) : "#0d9488",
    kind: ["day", "evening", "night", "on_call", "split"].includes(String(body.shift_kind)) ? String(body.shift_kind) : "day",
    overtimeAfter: Math.max(0, Number(body.overtime_after_minutes ?? 15) || 0),
    active: body.is_active !== false,
  }
  const duplicate = ((await sql`SELECT id FROM shift_definitions_tbl WHERE UPPER(code) = ${code} AND id <> ${Number(body.id) || 0}`) as any[])[0]
  if (duplicate) return NextResponse.json({ error: "رمز الوردية مستخدم مسبقاً" }, { status: 400 })
  const rows = update
    ? await sql`UPDATE shift_definitions_tbl SET code = ${values.code}, name = ${values.name}, start_time = ${values.start}, end_time = ${values.end},
        break_minutes = ${values.breakMinutes}, grace_minutes = ${values.grace}, is_overnight = ${values.overnight}, color = ${values.color},
        shift_kind = ${values.kind}, overtime_after_minutes = ${values.overtimeAfter}, is_active = ${values.active}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${Number(body.id) || 0} RETURNING id`
    : await sql`INSERT INTO shift_definitions_tbl (code, name, start_time, end_time, break_minutes, grace_minutes, is_overnight, color, shift_kind, overtime_after_minutes, is_active)
        VALUES (${values.code}, ${values.name}, ${values.start}, ${values.end}, ${values.breakMinutes}, ${values.grace}, ${values.overnight}, ${values.color}, ${values.kind}, ${values.overtimeAfter}, ${values.active}) RETURNING id`
  if (!rows.length) return NextResponse.json({ error: "الوردية غير موجودة" }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function POST(request: NextRequest) {
  try { return await save(request, false) } catch (error) { console.error("Shift template save error:", error); return NextResponse.json({ error: "تعذر حفظ الوردية" }, { status: 500 }) }
}
export async function PUT(request: NextRequest) {
  try { return await save(request, true) } catch (error) { console.error("Shift template save error:", error); return NextResponse.json({ error: "تعذر حفظ الوردية" }, { status: 500 }) }
}
export async function DELETE(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const id = Number(request.nextUrl.searchParams.get("id")) || 0
    const used = ((await sql`SELECT (SELECT COUNT(*) FROM employee_shift_roster_tbl WHERE shift_id = ${id}) + (SELECT COUNT(*) FROM attendance_days_tbl WHERE shift_id = ${id}) AS n`) as any[])[0]
    if (Number(used?.n) > 0) {
      await sql`UPDATE shift_definitions_tbl SET is_active = false WHERE id = ${id}`
      return NextResponse.json({ deactivated: true, message: "الوردية مستخدمة في الجداول أو السجلات — تم إيقافها بدل حذفها" })
    }
    await sql`DELETE FROM shift_definitions_tbl WHERE id = ${id}`
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error("Shift template delete error:", error)
    return NextResponse.json({ error: "تعذر حذف الوردية" }, { status: 500 })
  }
}
