import sql from "@/lib/database"
import { ATTENDANCE_TRANSACTION_TYPES, ensureAttendanceSchema } from "@/lib/attendance-engine"

// ربط حركات الدوام المعتمدة بالراتب: كل حركة تُسعَّر من الراتب الأساسي حسب نوعها وتُضاف لاستحقاقات الموظف
// أو تُخصم منه. الأجر اليومي = الأساسي ÷ أيام الشهر المعتمدة، وأجر الساعة = اليومي ÷ ساعات اليوم.
// المبلغ المُدخل يدوياً على الحركة يتقدّم على الاحتساب.

export const ATTENDANCE_PAYROLL_SETTINGS = {
  enabled: { id: "hr_att_include_in_payroll", description: "احتساب حركات الدوام المعتمدة في الراتب", fallback: "true" },
  monthDays: { id: "hr_att_month_days", description: "أيام الشهر لاحتساب الأجر اليومي", fallback: "30" },
  hoursPerDay: { id: "hr_att_hours_per_day", description: "ساعات يوم العمل لاحتساب أجر الساعة", fallback: "8" },
  overtimeRate: { id: "hr_att_overtime_rate", description: "معامل العمل الإضافي", fallback: "1.5" },
  holidayRate: { id: "hr_att_holiday_rate", description: "معامل العمل الإضافي في العطل", fallback: "2" },
  nightAmount: { id: "hr_att_night_amount", description: "بدل المناوبة الليلية لليوم", fallback: "0" },
  earningsAccount: { id: "hr_att_earnings_account", description: "حساب استحقاقات الدوام (إضافي/مكافآت)", fallback: "" },
  deductionsAccount: { id: "hr_att_deductions_account", description: "حساب خصومات الدوام (تأخير/غياب/جزاءات)", fallback: "" },
} as const
export type AttendancePayrollSettings = { enabled: boolean; monthDays: number; hoursPerDay: number; overtimeRate: number; holidayRate: number; nightAmount: number; earningsAccount: string; deductionsAccount: string }

export async function attendancePayrollSettings(): Promise<AttendancePayrollSettings> {
  const ids = Object.values(ATTENDANCE_PAYROLL_SETTINGS).map((item) => item.id)
  const rows = (await sql`SELECT id, value FROM system_settings WHERE id = ANY(${ids}::text[])`) as any[]
  const value = (key: keyof typeof ATTENDANCE_PAYROLL_SETTINGS) => {
    const row = rows.find((item) => item.id === ATTENDANCE_PAYROLL_SETTINGS[key].id)
    return row?.value ?? ATTENDANCE_PAYROLL_SETTINGS[key].fallback
  }
  const positive = (text: string, fallback: number) => (Number(text) > 0 ? Number(text) : fallback)
  return {
    enabled: !["false", "0", ""].includes(String(value("enabled")).toLowerCase()),
    monthDays: positive(value("monthDays"), 30),
    hoursPerDay: positive(value("hoursPerDay"), 8),
    overtimeRate: positive(value("overtimeRate"), 1.5),
    holidayRate: positive(value("holidayRate"), 2),
    nightAmount: Math.max(0, Number(value("nightAmount")) || 0),
    earningsAccount: String(value("earningsAccount") || ""),
    deductionsAccount: String(value("deductionsAccount") || ""),
  }
}

export async function saveAttendancePayrollSettings(input: Record<string, unknown>) {
  for (const [key, meta] of Object.entries(ATTENDANCE_PAYROLL_SETTINGS)) {
    if (!(key in input)) continue
    const value = String(input[key] ?? "")
    await sql`
      INSERT INTO system_settings (id, description, value) VALUES (${meta.id}, ${meta.description}, ${value})
      ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
    `
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** قيمة حركة واحدة بالعملة: موجبة دائماً، والإشارة من kind (استحقاق/خصم). info = 0. */
export function attendanceTransactionValue(row: { trans_type: string; quantity: number; amount: number }, basicSalary: number, settings: AttendancePayrollSettings) {
  const meta = ATTENDANCE_TRANSACTION_TYPES[row.trans_type]
  if (!meta || meta.kind === "info") return 0
  if (Number(row.amount) > 0) return round3(Number(row.amount))
  const daily = basicSalary / settings.monthDays
  const hourly = daily / settings.hoursPerDay
  const quantity = Number(row.quantity) || 0
  switch (row.trans_type) {
    case "overtime": return round3(quantity * hourly * settings.overtimeRate)
    case "holiday_overtime": return round3(quantity * hourly * settings.holidayRate)
    case "late_deduction":
    case "early_leave_deduction": return round3(quantity * hourly)
    case "absence_deduction":
    case "unpaid_leave": return round3(quantity * daily)
    case "night_allowance": return round3(quantity * settings.nightAmount)
    default: return 0
  }
}

export type AttendancePayrollLine = { trans_type: string; label: string; kind: "earning" | "deduction"; quantity: number; amount: number }
export type AttendancePayrollTotals = { earnings: number; deductions: number; lines: AttendancePayrollLine[] }

/** مجاميع حركات الدوام المعتمدة لكل موظف في شهر (مجمّعة حسب النوع). */
export async function attendancePayrollTotals(year: number, month: number, employees: Array<{ id: number; basic_salary: number }>) {
  await ensureAttendanceSchema()
  const result = new Map<number, AttendancePayrollTotals>()
  const settings = await attendancePayrollSettings()
  if (!settings.enabled || !employees.length) return { settings, totals: result }
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`
  const basicById = new Map(employees.map((row) => [Number(row.id), Number(row.basic_salary) || 0]))
  const rows = (await sql`
    SELECT employee_id, trans_type, quantity::float AS quantity, amount::float AS amount
    FROM attendance_transactions_tbl
    WHERE status = 'approved' AND trans_date BETWEEN ${monthStart}::date AND ${monthEnd}::date
      AND employee_id = ANY(${[...basicById.keys()]}::int[])
  `) as any[]
  for (const row of rows) {
    const meta = ATTENDANCE_TRANSACTION_TYPES[row.trans_type]
    if (!meta || meta.kind === "info") continue
    const value = attendanceTransactionValue(row, basicById.get(Number(row.employee_id)) || 0, settings)
    if (!value) continue
    const totals = result.get(Number(row.employee_id)) || { earnings: 0, deductions: 0, lines: [] }
    if (meta.kind === "earning") totals.earnings = round3(totals.earnings + value)
    else totals.deductions = round3(totals.deductions + value)
    const line = totals.lines.find((item) => item.trans_type === row.trans_type)
    if (line) { line.quantity = round3(line.quantity + (Number(row.quantity) || 0)); line.amount = round3(line.amount + value) }
    else totals.lines.push({ trans_type: row.trans_type, label: meta.label, kind: meta.kind, quantity: Number(row.quantity) || 0, amount: value })
    result.set(Number(row.employee_id), totals)
  }
  return { settings, totals: result }
}

/** هل راتب الموظف لهذا التاريخ مغلق؟ (لمنع تغيير اعتماد حركات دخلت راتباً مغلقاً) */
export async function closedPayrollEmployees(employeeDates: Array<{ employee_id: number; trans_date: string }>) {
  if (!employeeDates.length) return new Set<string>()
  const rows = (await sql`
    SELECT p.employee_id, sp.year, sp.month FROM payroll_tbl p JOIN salary_periods_tbl sp ON sp.id = p.period_id
    WHERE COALESCE(p.is_closed, false) = true AND p.employee_id = ANY(${[...new Set(employeeDates.map((row) => Number(row.employee_id)))]}::int[])
  `) as any[]
  return new Set(rows.map((row) => `${row.employee_id}|${row.year}-${String(row.month).padStart(2, "0")}`))
}
