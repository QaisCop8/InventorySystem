import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensureHrSchema } from "@/lib/hr-schema"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// محرك الدوام: يحوّل حركات البصمة الخام (attendance_logs_tbl) إلى سجل يومي لكل موظف (attendance_days_tbl)
// على نمط أنظمة الموارد البشرية والمستشفيات:
//  1) الوردية المجدولة لليوم: جدول المناوبات اليومي (employee_shift_roster_tbl) ⇐ قواعد الجداول بفترة
//     (shift_schedule_rules_tbl للموظف ثم للقسم) ⇐ الجدول الأسبوعي (employee_shift_assignments_tbl).
//  2) نافذة الوردية: من البداية إلى النهاية (الوردية الليلية تنتهي في اليوم التالي)، وتُنسب لها حركات
//     البصمة من (البداية − 4 ساعات) حتى (النهاية + 6 ساعات) — فدخول 22:00 وخروج 07:00 يوم واحد.
//  3) الدخول = أول حركة، الخروج = آخر حركة (حركة واحدة ⇐ "بصمة ناقصة")؛ الساعات = الخروج − الدخول − الاستراحة.
//  4) التأخير بعد فترة السماح، الخروج المبكر، والعمل الإضافي (الزيادة عن ساعات الوردية بعد حد الاحتساب).
//  5) الحالة: حاضر، متأخر، بصمة ناقصة، غائب، عطلة رسمية، يوم راحة، عمل بلا وردية.
// السجلات المعدّلة يدوياً (is_manual) لا تُعاد معالجتها إلا بطلب صريح (overwrite).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ready = new Map<string, Promise<void>>()
export async function ensureAttendanceSchema() {
  await ensureHrSchema()
  const dbName = await resolveCurrentDbName()
  let pending = ready.get(dbName)
  if (!pending) {
    pending = (async () => {
      await sql`ALTER TABLE shift_definitions_tbl ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#0d9488'`
      await sql`ALTER TABLE shift_definitions_tbl ADD COLUMN IF NOT EXISTS shift_kind VARCHAR(20) DEFAULT 'day'`
      await sql`ALTER TABLE shift_definitions_tbl ADD COLUMN IF NOT EXISTS overtime_after_minutes INTEGER DEFAULT 15`
      await sql`CREATE TABLE IF NOT EXISTS employee_shift_roster_tbl (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE,
        roster_date DATE NOT NULL,
        shift_id INTEGER REFERENCES shift_definitions_tbl(id) ON DELETE SET NULL,
        is_day_off BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, roster_date)
      )`
      await sql`CREATE TABLE IF NOT EXISTS attendance_days_tbl (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        shift_id INTEGER REFERENCES shift_definitions_tbl(id) ON DELETE SET NULL,
        scheduled_start TIMESTAMP,
        scheduled_end TIMESTAMP,
        check_in TIMESTAMP,
        check_out TIMESTAMP,
        required_minutes INTEGER NOT NULL DEFAULT 0,
        worked_minutes INTEGER NOT NULL DEFAULT 0,
        late_minutes INTEGER NOT NULL DEFAULT 0,
        early_leave_minutes INTEGER NOT NULL DEFAULT 0,
        overtime_minutes INTEGER NOT NULL DEFAULT 0,
        punches_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'absent',
        is_manual BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, work_date)
      )`
      await sql`CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days_tbl(work_date)`
      await sql`CREATE TABLE IF NOT EXISTS attendance_day_audit_tbl (
        id SERIAL PRIMARY KEY,
        day_id INTEGER,
        employee_id INTEGER NOT NULL,
        work_date DATE NOT NULL,
        action VARCHAR(20) NOT NULL,
        before_data JSONB,
        after_data JSONB,
        reason TEXT,
        changed_by INTEGER,
        changed_by_name VARCHAR(200),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
      await sql`CREATE TABLE IF NOT EXISTS attendance_transactions_tbl (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES employees_tbl(id) ON DELETE CASCADE,
        trans_date DATE NOT NULL,
        trans_type VARCHAR(30) NOT NULL,
        quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
        unit VARCHAR(10) NOT NULL DEFAULT 'hours',
        amount NUMERIC(18,3) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        source VARCHAR(20) NOT NULL DEFAULT 'manual',
        source_day_id INTEGER,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by INTEGER,
        approved_at TIMESTAMP
      )`
      await sql`CREATE INDEX IF NOT EXISTS idx_attendance_trans_date ON attendance_transactions_tbl(trans_date)`
    })().catch((error) => { ready.delete(dbName); throw error })
    ready.set(dbName, pending)
  }
  return pending
}

// ── وقت كدقائق مطلقة (UTC ثابت — بلا انزياح منطقة زمنية؛ الأوقات المخزنة محلية بلا منطقة) ──
const minutesOf = (date: string, time = "00:00") => {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  return Math.round(Date.UTC(y, m - 1, d, hh || 0, mm || 0) / 60000)
}
const stamp = (minutes: number) => new Date(minutes * 60000).toISOString().slice(0, 16).replace("T", " ")
const addDays = (date: string, days: number) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days)).toISOString().slice(0, 10)
export const datesBetween = (from: string, to: string) => {
  const list: string[] = []
  for (let date = from; date <= to && list.length < 400; date = addDays(date, 1)) list.push(date)
  return list
}
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

export type ShiftRow = { id: number; code: string; name: string; start_time: string; end_time: string; break_minutes: number; grace_minutes: number; is_overnight: boolean; overtime_after_minutes: number | null; color?: string }

/** نافذة الوردية في يوم معيّن (دقائق مطلقة). */
export function shiftWindow(shift: ShiftRow, date: string) {
  const start = minutesOf(date, String(shift.start_time).slice(0, 5))
  let end = minutesOf(date, String(shift.end_time).slice(0, 5))
  if (shift.is_overnight || end <= start) end += 24 * 60
  const required = Math.max(0, end - start - (Number(shift.break_minutes) || 0))
  return { start, end, required }
}

/** احتساب يوم واحد من الوردية والحركات (يُستخدم بالمعالجة وبالتعديل اليدوي). */
export function computeDay(input: { shift: ShiftRow | null; date: string; checkIn: number | null; checkOut: number | null; punches: number; holiday: boolean; dayOff: boolean }) {
  const { shift, date, holiday, dayOff } = input
  const window = shift ? shiftWindow(shift, date) : null
  const checkIn = input.checkIn
  const checkOut = input.checkOut != null && checkIn != null && input.checkOut > checkIn ? input.checkOut : null
  const gross = checkIn != null && checkOut != null ? checkOut - checkIn : 0
  const breakMinutes = shift && gross >= (window!.required / 2) ? Number(shift.break_minutes) || 0 : 0
  const worked = Math.max(0, gross - breakMinutes)
  const grace = shift ? Number(shift.grace_minutes) || 0 : 0
  const late = window && checkIn != null && checkIn > window.start + grace ? checkIn - window.start : 0
  const early = window && checkOut != null && checkOut < window.end - grace ? window.end - checkOut : 0
  const otThreshold = shift ? Number(shift.overtime_after_minutes ?? 15) : 0
  const extra = window ? worked - window.required : worked
  const overtime = window ? (extra >= otThreshold ? extra : 0) : (dayOff || holiday ? worked : 0)
  let status = "present"
  if (checkIn == null) status = holiday ? "holiday" : dayOff || !shift ? "day_off" : "absent"
  else if (checkOut == null) status = "incomplete"
  else if (!shift) status = holiday ? "holiday_work" : "unscheduled"
  else if (late > 0) status = "late"
  return {
    scheduled_start: window ? stamp(window.start) : null,
    scheduled_end: window ? stamp(window.end) : null,
    check_in: checkIn != null ? stamp(checkIn) : null,
    check_out: checkOut != null ? stamp(checkOut) : null,
    required_minutes: window?.required ?? 0,
    worked_minutes: worked,
    late_minutes: late,
    early_leave_minutes: early,
    overtime_minutes: Math.max(0, overtime),
    punches_count: input.punches,
    status,
  }
}

export const toMinutes = (value: string | null | undefined) => {
  const text = String(value || "").trim().replace("T", " ")
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)) return null
  return minutesOf(text.slice(0, 10), text.slice(11, 16))
}

/** الوردية المجدولة لكل (موظف، يوم) — المناوبات اليومية ⇐ القواعد بفترة ⇐ الأسبوعي. */
async function scheduledShifts(employees: any[], from: string, to: string) {
  const employeeIds = employees.map((row) => Number(row.id))
  const [roster, rules, weekly, shifts, holidays, exceptions] = await Promise.all([
    sql`SELECT employee_id, roster_date::text AS roster_date, shift_id, is_day_off FROM employee_shift_roster_tbl WHERE employee_id = ANY(${employeeIds}::int[]) AND roster_date BETWEEN ${from}::date AND ${to}::date`,
    sql`SELECT employee_id, department_id, date_from::text AS date_from, date_to::text AS date_to, weekday, shift_id, is_day_off FROM shift_schedule_rules_tbl WHERE date_to >= ${from}::date AND date_from <= ${to}::date ORDER BY id DESC`,
    sql`SELECT employee_id, weekday, shift_id, is_day_off FROM employee_shift_assignments_tbl WHERE employee_id = ANY(${employeeIds}::int[])`,
    sql`SELECT id, code, name, start_time::text AS start_time, end_time::text AS end_time, break_minutes, grace_minutes, is_overnight, overtime_after_minutes, color FROM shift_definitions_tbl`,
    sql`SELECT id, holiday_date::text AS holiday_date, end_date::text AS end_date FROM official_holidays_tbl WHERE end_date >= ${from}::date AND holiday_date <= ${to}::date`,
    sql`SELECT holiday_id, employee_id, is_day_off FROM employee_holiday_exceptions_tbl`,
  ])
  const shiftById = new Map((shifts as any[]).map((row) => [Number(row.id), row as ShiftRow]))
  const rosterMap = new Map((roster as any[]).map((row) => [`${row.employee_id}|${row.roster_date}`, row]))
  return {
    shiftById,
    resolve(employee: any, date: string): { shift: ShiftRow | null; dayOff: boolean; holiday: boolean; source: string } {
      const weekday = weekdayOf(date)
      const holiday = (holidays as any[]).some((row) => date >= row.holiday_date && date <= row.end_date
        && !(exceptions as any[]).some((ex) => Number(ex.holiday_id) === Number(row.id) && Number(ex.employee_id) === Number(employee.id) && !ex.is_day_off))
      const pick = (row: any, source: string) => ({ shift: row.is_day_off ? null : shiftById.get(Number(row.shift_id)) || null, dayOff: Boolean(row.is_day_off), holiday, source })
      const rosterRow = rosterMap.get(`${employee.id}|${date}`)
      if (rosterRow) return pick(rosterRow, "roster")
      const rule = (rules as any[]).find((row) => Number(row.employee_id) === Number(employee.id) && date >= row.date_from && date <= row.date_to && Number(row.weekday) === weekday)
        || (rules as any[]).find((row) => row.department_id && Number(row.department_id) === Number(employee.department_id) && date >= row.date_from && date <= row.date_to && Number(row.weekday) === weekday)
      if (rule) return pick(rule, "schedule")
      const week = (weekly as any[]).find((row) => Number(row.employee_id) === Number(employee.id) && Number(row.weekday) === weekday)
      if (week) return pick(week, "weekly")
      return { shift: null, dayOff: false, holiday, source: "none" }
    },
  }
}

export type ProcessOptions = { from: string; to: string; employeeIds?: number[]; departmentId?: number; branchId?: number; overwriteManual?: boolean; userId?: number | null }

/** معالجة حركات الدخول والخروج للفترة ⇒ upsert في attendance_days_tbl. */
export async function processAttendance(options: ProcessOptions) {
  await ensureAttendanceSchema()
  const { from, to } = options
  const employeeIds = options.employeeIds || []
  const employees = (await sql`
    SELECT id, employee_code, full_name, department_id, branch_id, hire_date::text AS hire_date, end_date::text AS end_date
    FROM employees_tbl
    WHERE COALESCE(status, 1) = 1
      AND (${employeeIds.length === 0} OR id = ANY(${employeeIds}::int[]))
      AND (${Number(options.departmentId) || 0} = 0 OR department_id = ${Number(options.departmentId) || 0})
      AND (${Number(options.branchId) || 0} = 0 OR branch_id = ${Number(options.branchId) || 0})
    ORDER BY employee_code
  `) as any[]
  if (!employees.length) return { processed: 0, skippedManual: 0, employees: 0 }
  const ids = employees.map((row) => Number(row.id))
  const schedule = await scheduledShifts(employees, from, to)
  // الحركات: من يوم قبل البداية حتى يوم بعد النهاية (الورديات الليلية)
  const punches = (await sql`
    SELECT COALESCE(l.employee_id, e.id) AS employee_id, to_char(l.punch_time, 'YYYY-MM-DD HH24:MI') AS punch_time
    FROM attendance_logs_tbl l
    LEFT JOIN employees_tbl e ON l.employee_id IS NULL AND e.employee_code = l.employee_code
    WHERE COALESCE(l.employee_id, e.id) = ANY(${ids}::int[])
      AND l.punch_time >= (${from}::date - INTERVAL '1 day') AND l.punch_time < (${to}::date + INTERVAL '2 day')
    ORDER BY l.punch_time
  `) as any[]
  const punchesByEmployee = new Map<number, number[]>()
  for (const row of punches) {
    const minutes = toMinutes(row.punch_time)
    if (minutes == null) continue
    const list = punchesByEmployee.get(Number(row.employee_id)) || []
    list.push(minutes)
    punchesByEmployee.set(Number(row.employee_id), list)
  }
  const manual = (await sql`SELECT employee_id, work_date::text AS work_date FROM attendance_days_tbl WHERE is_manual = true AND employee_id = ANY(${ids}::int[]) AND work_date BETWEEN ${from}::date AND ${to}::date`) as any[]
  const manualKeys = new Set(manual.map((row) => `${row.employee_id}|${row.work_date}`))

  let processed = 0
  let skippedManual = 0
  for (const employee of employees) {
    const all = punchesByEmployee.get(Number(employee.id)) || []
    const used = new Set<number>()
    for (const date of datesBetween(from, to)) {
      if (employee.hire_date && date < employee.hire_date) continue
      if (employee.end_date && date > employee.end_date) continue
      const key = `${employee.id}|${date}`
      if (manualKeys.has(key) && !options.overwriteManual) { skippedManual++; continue }
      const plan = schedule.resolve(employee, date)
      let windowStart: number
      let windowEnd: number
      if (plan.shift) {
        const window = shiftWindow(plan.shift, date)
        windowStart = window.start - 4 * 60
        windowEnd = window.end + 6 * 60
      } else {
        windowStart = minutesOf(date, "00:00")
        windowEnd = minutesOf(date, "23:59")
      }
      // بعد نهاية الوردية: أول حركة هي الخروج، ثم تُضم فقط الحركات المتتابعة بفاصل ≤ ساعتين (بصمات مكررة/إضافي متصل)
      // — فلا تبتلع الوردية الليلية حركات اليوم التالي، وتبقى غير المستخدمة متاحة لليوم التالي.
      const shiftEnd = plan.shift ? shiftWindow(plan.shift, date).end : windowEnd
      const dayIndexes: number[] = []
      for (let index = 0; index < all.length; index++) {
        const minutes = all[index]
        if (used.has(index) || minutes < windowStart || minutes > windowEnd) continue
        const previous = dayIndexes.length ? all[dayIndexes[dayIndexes.length - 1]] : null
        if (minutes > shiftEnd && previous != null && previous > shiftEnd && minutes - previous > 120) break
        dayIndexes.push(index)
      }
      dayIndexes.forEach((index) => used.add(index))
      const dayPunches = dayIndexes.map((index) => all[index])
      const checkIn = dayPunches.length ? dayPunches[0] : null
      const checkOut = dayPunches.length > 1 ? dayPunches[dayPunches.length - 1] : null
      // يوم بلا وردية وبلا حركات ⇐ لا سجل (لا داعي لتسجيل أيام غير مجدولة فارغة)
      if (!plan.shift && checkIn == null && !plan.holiday && !plan.dayOff) continue
      const day = computeDay({ shift: plan.shift, date, checkIn, checkOut, punches: dayPunches.length, holiday: plan.holiday, dayOff: plan.dayOff })
      await sql`
        INSERT INTO attendance_days_tbl (employee_id, work_date, shift_id, scheduled_start, scheduled_end, check_in, check_out, required_minutes, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, punches_count, status, is_manual, processed_at, updated_by, updated_at)
        VALUES (${employee.id}, ${date}, ${plan.shift?.id ?? null}, ${day.scheduled_start}, ${day.scheduled_end}, ${day.check_in}, ${day.check_out}, ${day.required_minutes}, ${day.worked_minutes}, ${day.late_minutes}, ${day.early_leave_minutes}, ${day.overtime_minutes}, ${day.punches_count}, ${day.status}, false, CURRENT_TIMESTAMP, ${options.userId ?? null}, CURRENT_TIMESTAMP)
        ON CONFLICT (employee_id, work_date) DO UPDATE SET
          shift_id = EXCLUDED.shift_id, scheduled_start = EXCLUDED.scheduled_start, scheduled_end = EXCLUDED.scheduled_end,
          check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, required_minutes = EXCLUDED.required_minutes,
          worked_minutes = EXCLUDED.worked_minutes, late_minutes = EXCLUDED.late_minutes, early_leave_minutes = EXCLUDED.early_leave_minutes,
          overtime_minutes = EXCLUDED.overtime_minutes, punches_count = EXCLUDED.punches_count, status = EXCLUDED.status,
          is_manual = false, processed_at = CURRENT_TIMESTAMP, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      `
      processed++
    }
  }
  return { processed, skippedManual, employees: employees.length }
}

/** إعادة احتساب يوم مُعدَّل يدوياً (بعد تغيير الوردية أو الدخول/الخروج). */
export async function recomputeManualDay(input: { employeeId: number; date: string; shiftId: number | null; checkIn: string | null; checkOut: string | null; status?: string | null }) {
  await ensureAttendanceSchema()
  const employee = ((await sql`SELECT id, department_id FROM employees_tbl WHERE id = ${input.employeeId}`) as any[])[0]
  if (!employee) throw new Error("الموظف غير موجود")
  const schedule = await scheduledShifts([employee], input.date, input.date)
  const plan = schedule.resolve(employee, input.date)
  const shift = input.shiftId ? schedule.shiftById.get(Number(input.shiftId)) || null : null
  const checkIn = toMinutes(input.checkIn)
  const checkOut = toMinutes(input.checkOut)
  const day = computeDay({ shift, date: input.date, checkIn, checkOut, punches: [checkIn, checkOut].filter((value) => value != null).length, holiday: plan.holiday, dayOff: !shift })
  // حالة يدوية صريحة (إجازة، مهمة عمل...) تتقدّم على المحسوبة
  return { ...day, status: input.status || day.status }
}

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "حاضر", late: "متأخر", incomplete: "بصمة ناقصة", absent: "غائب", holiday: "عطلة رسمية", day_off: "يوم راحة",
  unscheduled: "عمل بلا وردية", holiday_work: "عمل في عطلة", leave: "إجازة", mission: "مهمة عمل", sick: "إجازة مرضية",
}
export const ATTENDANCE_TRANSACTION_TYPES: Record<string, { label: string; unit: "hours" | "days" | "amount"; kind: "earning" | "deduction" | "info" }> = {
  overtime: { label: "عمل إضافي", unit: "hours", kind: "earning" },
  holiday_overtime: { label: "عمل إضافي في عطلة", unit: "hours", kind: "earning" },
  late_deduction: { label: "خصم تأخير", unit: "hours", kind: "deduction" },
  early_leave_deduction: { label: "خصم خروج مبكر", unit: "hours", kind: "deduction" },
  absence_deduction: { label: "خصم غياب", unit: "days", kind: "deduction" },
  permission: { label: "مغادرة / إذن", unit: "hours", kind: "info" },
  paid_leave: { label: "إجازة مدفوعة", unit: "days", kind: "info" },
  unpaid_leave: { label: "إجازة بدون راتب", unit: "days", kind: "deduction" },
  sick_leave: { label: "إجازة مرضية", unit: "days", kind: "info" },
  bonus: { label: "مكافأة", unit: "amount", kind: "earning" },
  penalty: { label: "جزاء / خصم إداري", unit: "amount", kind: "deduction" },
  night_allowance: { label: "بدل مناوبة ليلية", unit: "days", kind: "earning" },
}
