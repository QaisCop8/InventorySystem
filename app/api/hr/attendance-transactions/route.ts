import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ATTENDANCE_TRANSACTION_TYPES, ensureAttendanceSchema } from "@/lib/attendance-engine"
import { attendancePayrollSettings, closedPayrollEmployees, saveAttendancePayrollSettings } from "@/lib/attendance-payroll"

// حركات الدوام: عمل إضافي، خصومات (تأخير/خروج مبكر/غياب)، مغادرات، إجازات، مكافآت، جزاءات، بدل مناوبة.
//   GET    ?from&to&employee_ids&type&status
//   POST   { employee_id, trans_date, trans_type, quantity, amount, notes }              ⇒ إضافة يدوية
//   POST   { action: "generate", from, to, employee_ids?, types: [...] }                ⇒ توليد من سجلات الدوام المعالَجة
//   POST   { action: "set-status", ids: [...], status: "approved" | "rejected" | "pending" }
//   PUT    { id, ...fields }   ·   DELETE ?id

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const isoDate = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null)
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const p = request.nextUrl.searchParams
    if (p.get("settings") === "1") {
      const settings = await attendancePayrollSettings()
      const accounts = await sql`SELECT id, code, name FROM account_tbl WHERE id = ANY(${[Number(settings.earningsAccount) || 0, Number(settings.deductionsAccount) || 0]}::int[])`
      return NextResponse.json({ ...settings, accounts })
    }
    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(p.get("from")) || `${today.slice(0, 7)}-01`
    const to = isoDate(p.get("to")) || today
    const employeeIds = ids(p.get("employee_ids"))
    const type = String(p.get("type") || "")
    const status = String(p.get("status") || "")
    const rows = await sql`
      SELECT t.id, t.employee_id, e.employee_code, e.full_name AS employee_name, dep.department_name, t.trans_date::text AS trans_date,
        t.trans_type, t.quantity::float AS quantity, t.unit, t.amount::float AS amount, t.status, t.source, t.source_day_id, t.notes,
        to_char(t.created_at, 'YYYY-MM-DD HH24:MI') AS created_at, to_char(t.approved_at, 'YYYY-MM-DD HH24:MI') AS approved_at
      FROM attendance_transactions_tbl t
      JOIN employees_tbl e ON e.id = t.employee_id
      LEFT JOIN departments dep ON dep.id = e.department_id
      WHERE t.trans_date BETWEEN ${from}::date AND ${to}::date
        AND (${employeeIds.length === 0} OR t.employee_id = ANY(${employeeIds}::int[]))
        AND (${type} = '' OR t.trans_type = ${type})
        AND (${status} = '' OR t.status = ${status})
      ORDER BY t.trans_date DESC, e.employee_code, t.id DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Attendance transactions GET error:", error)
    return NextResponse.json({ error: "تعذر تحميل حركات الدوام" }, { status: 500 })
  }
}

function validate(body: any) {
  const employeeId = Number(body.employee_id) || 0
  const date = isoDate(body.trans_date)
  const type = String(body.trans_type || "")
  if (!employeeId || !date) return { error: "الموظف والتاريخ مطلوبان" }
  if (!ATTENDANCE_TRANSACTION_TYPES[type]) return { error: "نوع الحركة غير صالح" }
  const unit = ATTENDANCE_TRANSACTION_TYPES[type].unit
  const quantity = round2(Number(body.quantity) || 0)
  const amount = round2(Number(body.amount) || 0)
  if (unit !== "amount" && quantity <= 0) return { error: unit === "days" ? "أدخل عدد الأيام" : "أدخل عدد الساعات" }
  if (unit === "amount" && amount <= 0) return { error: "أدخل المبلغ" }
  return { employeeId, date, type, unit, quantity, amount, notes: String(body.notes || "").trim() || null }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const body = await request.json().catch(() => ({}))
    const userId = Number((user as any).user_id) || null

    if (body.action === "save-settings") {
      await saveAttendancePayrollSettings(body.settings || {})
      return NextResponse.json(await attendancePayrollSettings())
    }

    if (body.action === "set-status") {
      const status = ["approved", "rejected", "pending"].includes(String(body.status)) ? String(body.status) : null
      const list = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((id: number) => id > 0)
      if (!status || !list.length) return NextResponse.json({ error: "حدد الحركات والحالة" }, { status: 400 })
      // حركة دخلت راتباً مغلقاً لا يتغير اعتمادها
      const targets = (await sql`SELECT employee_id, trans_date::text AS trans_date FROM attendance_transactions_tbl WHERE id = ANY(${list}::int[])`) as any[]
      const closed = await closedPayrollEmployees(targets)
      if (targets.some((row) => closed.has(`${row.employee_id}|${String(row.trans_date).slice(0, 7)}`))) return NextResponse.json({ error: "بعض الحركات تخص راتب شهر مغلق — لا يمكن تغيير اعتمادها" }, { status: 400 })
      await sql`
        UPDATE attendance_transactions_tbl SET status = ${status},
          approved_by = ${status === "approved" ? userId : null}, approved_at = CASE WHEN ${status} = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = ANY(${list}::int[])
      `
      return NextResponse.json({ updated: list.length })
    }

    if (body.action === "generate") {
      // توليد حركات "قيد الاعتماد" من سجلات الدوام المعالَجة — لا تكرار لنفس اليوم والنوع
      const from = isoDate(body.from)
      const to = isoDate(body.to)
      if (!from || !to) return NextResponse.json({ error: "حدد الفترة" }, { status: 400 })
      const types = new Set((Array.isArray(body.types) ? body.types : ["overtime", "late_deduction", "early_leave_deduction", "absence_deduction"]).map(String))
      const employeeIds = (Array.isArray(body.employee_ids) ? body.employee_ids : []).map(Number).filter((id: number) => id > 0)
      const minLate = Math.max(0, Number(body.min_late_minutes) || 0)
      const days = (await sql`
        SELECT d.id, d.employee_id, d.work_date::text AS work_date, d.status, d.late_minutes, d.early_leave_minutes, d.overtime_minutes, d.required_minutes
        FROM attendance_days_tbl d
        WHERE d.work_date BETWEEN ${from}::date AND ${to}::date
          AND (${employeeIds.length === 0} OR d.employee_id = ANY(${employeeIds}::int[]))
      `) as any[]
      const existing = (await sql`
        SELECT source_day_id, trans_type FROM attendance_transactions_tbl
        WHERE source = 'auto' AND trans_date BETWEEN ${from}::date AND ${to}::date
      `) as any[]
      const existingKeys = new Set(existing.map((row) => `${row.source_day_id}|${row.trans_type}`))
      let created = 0
      const insert = async (day: any, type: string, quantity: number) => {
        if (!types.has(type) || quantity <= 0 || existingKeys.has(`${day.id}|${type}`)) return
        await sql`
          INSERT INTO attendance_transactions_tbl (employee_id, trans_date, trans_type, quantity, unit, amount, status, source, source_day_id, created_by)
          VALUES (${day.employee_id}, ${day.work_date}, ${type}, ${round2(quantity)}, ${ATTENDANCE_TRANSACTION_TYPES[type].unit}, 0, 'pending', 'auto', ${day.id}, ${userId})
        `
        created++
      }
      for (const day of days) {
        if (day.status === "holiday_work" || day.status === "unscheduled") await insert(day, day.status === "holiday_work" ? "holiday_overtime" : "overtime", Number(day.overtime_minutes) / 60)
        else await insert(day, "overtime", Number(day.overtime_minutes) / 60)
        if (Number(day.late_minutes) > minLate) await insert(day, "late_deduction", Number(day.late_minutes) / 60)
        await insert(day, "early_leave_deduction", Number(day.early_leave_minutes) / 60)
        if (day.status === "absent") await insert(day, "absence_deduction", 1)
      }
      return NextResponse.json({ created })
    }

    const valid = validate(body)
    if ("error" in valid) return NextResponse.json({ error: valid.error }, { status: 400 })
    const row = ((await sql`
      INSERT INTO attendance_transactions_tbl (employee_id, trans_date, trans_type, quantity, unit, amount, status, source, notes, created_by)
      VALUES (${valid.employeeId}, ${valid.date}, ${valid.type}, ${valid.quantity}, ${valid.unit}, ${valid.amount}, 'pending', 'manual', ${valid.notes}, ${userId})
      RETURNING id
    `) as any[])[0]
    return NextResponse.json(row)
  } catch (error) {
    console.error("Attendance transactions POST error:", error)
    return NextResponse.json({ error: "تعذر حفظ حركة الدوام" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const body = await request.json().catch(() => ({}))
    const id = Number(body.id) || 0
    const valid = validate(body)
    if (!id) return NextResponse.json({ error: "الحركة غير محددة" }, { status: 400 })
    if ("error" in valid) return NextResponse.json({ error: valid.error }, { status: 400 })
    const current = ((await sql`SELECT status FROM attendance_transactions_tbl WHERE id = ${id}`) as any[])[0]
    if (!current) return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 })
    if (current.status === "approved") return NextResponse.json({ error: "لا يمكن تعديل حركة معتمدة — ألغِ اعتمادها أولاً" }, { status: 400 })
    await sql`
      UPDATE attendance_transactions_tbl SET employee_id = ${valid.employeeId}, trans_date = ${valid.date}, trans_type = ${valid.type},
        quantity = ${valid.quantity}, unit = ${valid.unit}, amount = ${valid.amount}, notes = ${valid.notes}
      WHERE id = ${id}
    `
    return NextResponse.json({ id })
  } catch (error) {
    console.error("Attendance transactions PUT error:", error)
    return NextResponse.json({ error: "تعذر تعديل حركة الدوام" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAttendanceSchema()
    const id = Number(request.nextUrl.searchParams.get("id")) || 0
    const current = ((await sql`SELECT status FROM attendance_transactions_tbl WHERE id = ${id}`) as any[])[0]
    if (!current) return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 })
    if (current.status === "approved") return NextResponse.json({ error: "لا يمكن حذف حركة معتمدة" }, { status: 400 })
    await sql`DELETE FROM attendance_transactions_tbl WHERE id = ${id}`
    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error("Attendance transactions DELETE error:", error)
    return NextResponse.json({ error: "تعذر حذف حركة الدوام" }, { status: 500 })
  }
}
