import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { datesBetween, ensureAttendanceSchema } from "@/lib/attendance-engine"

// جدول المناوبات اليومي (على نمط المستشفيات): وردية لكل موظف في كل يوم — تتقدّم على الجداول الأسبوعية.
//   GET  ?from&to&department_id         ⇒ { employees, shifts, cells: [{ employee_id, roster_date, shift_id, is_day_off }] }
//   POST { cells: [{ employee_id, roster_date, shift_id | null, is_day_off, clear? }] }      ⇒ حفظ خلايا
//   POST { action: "pattern", employee_ids, from, to, pattern: ["M","M","N","N","OFF","OFF"], offset_per_employee? }
//        ⇒ تدوير نمط من رموز الورديات (OFF = راحة) على الفترة — offset يوزّع الموظفين على مراحل النمط

const isoDate = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null)

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const p = request.nextUrl.searchParams
    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(p.get("from")) || today
    const to = isoDate(p.get("to")) || from
    const departmentId = Number(p.get("department_id")) || 0
    const [employees, shifts, cells] = await Promise.all([
      sql`SELECT e.id, e.employee_code, e.full_name, e.department_id, d.department_name FROM employees_tbl e LEFT JOIN departments d ON d.id = e.department_id
          WHERE COALESCE(e.status, 1) = 1 AND (${departmentId} = 0 OR e.department_id = ${departmentId}) ORDER BY d.department_name NULLS LAST, e.employee_code`,
      sql`SELECT id, code, name, start_time::text AS start_time, end_time::text AS end_time, break_minutes, grace_minutes, is_overnight, color, shift_kind, overtime_after_minutes, is_active
          FROM shift_definitions_tbl WHERE is_active = true ORDER BY start_time, name`,
      sql`SELECT employee_id, roster_date::text AS roster_date, shift_id, is_day_off, notes FROM employee_shift_roster_tbl WHERE roster_date BETWEEN ${from}::date AND ${to}::date`,
    ])
    return NextResponse.json({ employees, shifts, cells })
  } catch (error) {
    console.error("Shift roster GET error:", error)
    return NextResponse.json({ error: "تعذر تحميل جدول المناوبات" }, { status: 500 })
  }
}

async function saveCell(cell: { employee_id: number; roster_date: string; shift_id: number | null; is_day_off: boolean; clear?: boolean }) {
  if (cell.clear) {
    await sql`DELETE FROM employee_shift_roster_tbl WHERE employee_id = ${cell.employee_id} AND roster_date = ${cell.roster_date}::date`
    return
  }
  await sql`
    INSERT INTO employee_shift_roster_tbl (employee_id, roster_date, shift_id, is_day_off, updated_at)
    VALUES (${cell.employee_id}, ${cell.roster_date}, ${cell.is_day_off ? null : cell.shift_id}, ${cell.is_day_off}, CURRENT_TIMESTAMP)
    ON CONFLICT (employee_id, roster_date) DO UPDATE SET shift_id = EXCLUDED.shift_id, is_day_off = EXCLUDED.is_day_off, updated_at = CURRENT_TIMESTAMP
  `
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const body = await request.json().catch(() => ({}))

    if (body.action === "pattern") {
      const from = isoDate(body.from)
      const to = isoDate(body.to)
      const employeeIds = (Array.isArray(body.employee_ids) ? body.employee_ids : []).map(Number).filter((id: number) => id > 0)
      const pattern = (Array.isArray(body.pattern) ? body.pattern : String(body.pattern || "").split(/[,،\s]+/)).map((code: any) => String(code).trim().toUpperCase()).filter(Boolean)
      if (!from || !to || from > to || !employeeIds.length || !pattern.length) return NextResponse.json({ error: "حدد الموظفين والفترة ونمط الورديات" }, { status: 400 })
      const shifts = (await sql`SELECT id, UPPER(code) AS code FROM shift_definitions_tbl WHERE is_active = true`) as any[]
      const shiftByCode = new Map(shifts.map((row) => [String(row.code), Number(row.id)]))
      const unknown = pattern.filter((code: string) => code !== "OFF" && !shiftByCode.has(code))
      if (unknown.length) return NextResponse.json({ error: `رموز ورديات غير معرّفة: ${[...new Set(unknown)].join("، ")}` }, { status: 400 })
      const offset = Math.max(0, Number(body.offset_per_employee) || 0)
      const dates = datesBetween(from, to)
      let saved = 0
      for (const [employeeIndex, employeeId] of employeeIds.entries()) {
        for (const [dayIndex, date] of dates.entries()) {
          const code = pattern[(dayIndex + employeeIndex * offset) % pattern.length]
          await saveCell({ employee_id: employeeId, roster_date: date, shift_id: code === "OFF" ? null : shiftByCode.get(code) ?? null, is_day_off: code === "OFF" })
          saved++
        }
      }
      return NextResponse.json({ saved })
    }

    const cells = (Array.isArray(body.cells) ? body.cells : [])
      .map((cell: any) => ({ employee_id: Number(cell.employee_id) || 0, roster_date: isoDate(cell.roster_date) || "", shift_id: Number(cell.shift_id) || null, is_day_off: Boolean(cell.is_day_off), clear: Boolean(cell.clear) }))
      .filter((cell: any) => cell.employee_id && cell.roster_date && (cell.clear || cell.is_day_off || cell.shift_id))
    for (const cell of cells) await saveCell(cell)
    return NextResponse.json({ saved: cells.length })
  } catch (error) {
    console.error("Shift roster POST error:", error)
    return NextResponse.json({ error: "تعذر حفظ جدول المناوبات" }, { status: 500 })
  }
}
