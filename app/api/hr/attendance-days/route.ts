import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAttendanceSchema, processAttendance, recomputeManualDay } from "@/lib/attendance-engine"

// سجل الدوام اليومي المعالَج:
//   GET  ?from&to&employee_ids&department_id&branch_id&status   ⇒ الأيام
//   GET  ?audit=1&employee_id&from&to                            ⇒ سجل التعديلات
//   POST { action: "process", from, to, employee_ids?, department_id?, branch_id?, overwrite_manual? }
//   PUT  { employee_id, work_date, shift_id, check_in, check_out, status, notes, reason }  ⇒ تعديل/إضافة يدوية (مع سجل تدقيق)
//   DELETE ?id&reason                                              ⇒ حذف سجل يوم (مع سجل تدقيق)

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const isoDate = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null)
const asTimestamp = (value: unknown) => {
  const text = String(value || "").trim().replace("T", " ")
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? text.slice(0, 16) : null
}

const dayColumns = sql`
  d.id, d.employee_id, e.employee_code, e.full_name AS employee_name, dep.department_name, b.branch_name,
  d.work_date::text AS work_date, d.shift_id, s.code AS shift_code, s.name AS shift_name, s.color AS shift_color,
  to_char(d.scheduled_start, 'YYYY-MM-DD HH24:MI') AS scheduled_start, to_char(d.scheduled_end, 'YYYY-MM-DD HH24:MI') AS scheduled_end,
  to_char(d.check_in, 'YYYY-MM-DD HH24:MI') AS check_in, to_char(d.check_out, 'YYYY-MM-DD HH24:MI') AS check_out,
  d.required_minutes, d.worked_minutes, d.late_minutes, d.early_leave_minutes, d.overtime_minutes, d.punches_count,
  d.status, d.is_manual, d.notes, to_char(d.updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
`

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const p = request.nextUrl.searchParams
    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(p.get("from")) || today
    const to = isoDate(p.get("to")) || from
    if (p.get("audit") === "1") {
      const employeeId = Number(p.get("employee_id")) || 0
      return NextResponse.json(await sql`
        SELECT id, day_id, employee_id, work_date::text AS work_date, action, before_data, after_data, reason, changed_by_name, to_char(changed_at, 'YYYY-MM-DD HH24:MI') AS changed_at
        FROM attendance_day_audit_tbl
        WHERE (${employeeId} = 0 OR employee_id = ${employeeId}) AND work_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY changed_at DESC LIMIT 500
      `)
    }
    const employeeIds = ids(p.get("employee_ids"))
    const departmentId = Number(p.get("department_id")) || 0
    const branchId = Number(p.get("branch_id")) || 0
    const statuses = String(p.get("status") || "").split(",").filter(Boolean)
    const rows = await sql`
      SELECT ${dayColumns}
      FROM attendance_days_tbl d
      JOIN employees_tbl e ON e.id = d.employee_id
      LEFT JOIN departments dep ON dep.id = e.department_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN shift_definitions_tbl s ON s.id = d.shift_id
      WHERE d.work_date BETWEEN ${from}::date AND ${to}::date
        AND (${employeeIds.length === 0} OR d.employee_id = ANY(${employeeIds}::int[]))
        AND (${departmentId} = 0 OR e.department_id = ${departmentId})
        AND (${branchId} = 0 OR e.branch_id = ${branchId})
        AND (${statuses.length === 0} OR d.status = ANY(${statuses}::text[]))
      ORDER BY d.work_date, e.employee_code
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Attendance days GET error:", error)
    return NextResponse.json({ error: "تعذر تحميل سجلات الدوام" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    if (body?.action !== "process") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
    const from = isoDate(body.from)
    const to = isoDate(body.to)
    if (!from || !to || from > to) return NextResponse.json({ error: "حدد فترة صحيحة" }, { status: 400 })
    const result = await processAttendance({
      from, to,
      employeeIds: (Array.isArray(body.employee_ids) ? body.employee_ids : []).map(Number).filter((id: number) => id > 0),
      departmentId: Number(body.department_id) || 0,
      branchId: Number(body.branch_id) || 0,
      overwriteManual: Boolean(body.overwrite_manual),
      userId: Number((user as any).user_id) || null,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Attendance process error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذرت معالجة الحركات" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const body = await request.json().catch(() => ({}))
    const employeeId = Number(body.employee_id) || 0
    const date = isoDate(body.work_date)
    if (!employeeId || !date) return NextResponse.json({ error: "الموظف والتاريخ مطلوبان" }, { status: 400 })
    const reason = String(body.reason || "").trim()
    if (!reason) return NextResponse.json({ error: "سبب التعديل مطلوب" }, { status: 400 })
    const checkIn = asTimestamp(body.check_in)
    const checkOut = asTimestamp(body.check_out)
    if (checkIn && checkOut && checkOut <= checkIn) return NextResponse.json({ error: "وقت الخروج يجب أن يكون بعد وقت الدخول" }, { status: 400 })
    const shiftId = Number(body.shift_id) || null
    const manualStatus = ["leave", "mission", "sick", "absent", "day_off"].includes(String(body.status)) ? String(body.status) : null
    const computed = await recomputeManualDay({ employeeId, date, shiftId, checkIn, checkOut, status: manualStatus })
    const before = ((await sql`SELECT * FROM attendance_days_tbl WHERE employee_id = ${employeeId} AND work_date = ${date}::date`) as any[])[0] || null
    const userId = Number((user as any).user_id) || null
    const saved = ((await sql`
      INSERT INTO attendance_days_tbl (employee_id, work_date, shift_id, scheduled_start, scheduled_end, check_in, check_out, required_minutes, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, punches_count, status, is_manual, notes, updated_by, updated_at)
      VALUES (${employeeId}, ${date}, ${shiftId}, ${computed.scheduled_start}, ${computed.scheduled_end}, ${computed.check_in}, ${computed.check_out}, ${computed.required_minutes}, ${computed.worked_minutes}, ${computed.late_minutes}, ${computed.early_leave_minutes}, ${computed.overtime_minutes}, ${computed.punches_count}, ${computed.status}, true, ${String(body.notes || "") || null}, ${userId}, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id, work_date) DO UPDATE SET
        shift_id = EXCLUDED.shift_id, scheduled_start = EXCLUDED.scheduled_start, scheduled_end = EXCLUDED.scheduled_end,
        check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, required_minutes = EXCLUDED.required_minutes,
        worked_minutes = EXCLUDED.worked_minutes, late_minutes = EXCLUDED.late_minutes, early_leave_minutes = EXCLUDED.early_leave_minutes,
        overtime_minutes = EXCLUDED.overtime_minutes, punches_count = EXCLUDED.punches_count, status = EXCLUDED.status,
        is_manual = true, notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `) as any[])[0]
    await sql`
      INSERT INTO attendance_day_audit_tbl (day_id, employee_id, work_date, action, before_data, after_data, reason, changed_by, changed_by_name)
      VALUES (${saved.id}, ${employeeId}, ${date}, ${before ? "update" : "create"}, ${before ? JSON.stringify(before) : null}::jsonb, ${JSON.stringify(saved)}::jsonb, ${reason}, ${userId}, ${String((user as any).full_name || (user as any).username || "")})
    `
    return NextResponse.json(saved)
  } catch (error) {
    console.error("Attendance day save error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ سجل الدوام" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const id = Number(request.nextUrl.searchParams.get("id")) || 0
    const reason = String(request.nextUrl.searchParams.get("reason") || "").trim()
    if (!id || !reason) return NextResponse.json({ error: "السجل وسبب الحذف مطلوبان" }, { status: 400 })
    const before = ((await sql`DELETE FROM attendance_days_tbl WHERE id = ${id} RETURNING *`) as any[])[0]
    if (!before) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    await sql`
      INSERT INTO attendance_day_audit_tbl (day_id, employee_id, work_date, action, before_data, reason, changed_by, changed_by_name)
      VALUES (${id}, ${before.employee_id}, ${before.work_date}, 'delete', ${JSON.stringify(before)}::jsonb, ${reason}, ${Number((user as any).user_id) || null}, ${String((user as any).full_name || (user as any).username || "")})
    `
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error("Attendance day delete error:", error)
    return NextResponse.json({ error: "تعذر حذف السجل" }, { status: 500 })
  }
}
