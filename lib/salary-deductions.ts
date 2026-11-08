import sql from "@/lib/database"

// السلف والقروض والخصم النقدي (نظام ادارة الموظفين، 2026-11-08): كل حركة تُقسَّم على أشهر رواتب (جدول
// employee_salary_deduction_schedule_tbl) — السلفة والخصم النقدي شهر واحد، والقرض أقساط شهرية. الأقساط تُخصم من صافي
// راتب الشهر عند فتحه/إعادة احتسابه (لا تدخل وعاء الضريبة)، وتظهر في قيد الراتب دائنةً على حساب كل نوع.
// لا حفظ ولا تعديل ولا حذف لحركة يقع أحد أشهرها في راتب مغلق/مدفوع لذلك الموظف.

export const SALARY_DEDUCTION_TYPES = {
  advance: { label: "السلف", single: "سلفة", setting: { id: "hr_advances_account", description: "حساب سلف الموظفين" } },
  loan: { label: "القروض", single: "قرض", setting: { id: "hr_loans_account", description: "حساب قروض الموظفين" } },
  cash: { label: "خصم نقدي", single: "خصم نقدي", setting: { id: "hr_cash_deductions_account", description: "حساب الخصومات النقدية على الموظفين" } },
} as const
export type SalaryDeductionType = keyof typeof SALARY_DEDUCTION_TYPES
export const isSalaryDeductionType = (value: unknown): value is SalaryDeductionType =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(SALARY_DEDUCTION_TYPES, value)

const round3 = (value: number) => Math.round((Number(value) || 0) * 1000) / 1000
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`

let schemaReady: Promise<void> | null = null
export function ensureSalaryDeductionsSchema() {
  schemaReady ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS employee_salary_deductions_tbl (
      id SERIAL PRIMARY KEY,
      deduction_type VARCHAR(20) NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES employees_tbl(id),
      doc_date DATE NOT NULL,
      amount NUMERIC(18,3) NOT NULL,
      installments INTEGER NOT NULL DEFAULT 1,
      start_year INTEGER NOT NULL,
      start_month INTEGER NOT NULL,
      notes TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      updated_at TIMESTAMP
    )`
    await sql`CREATE TABLE IF NOT EXISTS employee_salary_deduction_schedule_tbl (
      id SERIAL PRIMARY KEY,
      deduction_id INTEGER NOT NULL REFERENCES employee_salary_deductions_tbl(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      amount NUMERIC(18,3) NOT NULL
    )`
    await sql`CREATE INDEX IF NOT EXISTS employee_salary_deduction_schedule_month_idx ON employee_salary_deduction_schedule_tbl (year, month, employee_id)`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS advance_deductions NUMERIC(18,3) DEFAULT 0`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS loan_deductions NUMERIC(18,3) DEFAULT 0`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS cash_deductions NUMERIC(18,3) DEFAULT 0`
    await sql`ALTER TABLE payroll_tbl ADD COLUMN IF NOT EXISTS salary_deduction_details JSONB`
  })().catch((error) => {
    schemaReady = null
    throw error
  })
  return schemaReady
}

/** أقساط متساوية من شهر البداية؛ القسط الأخير يأخذ فرق التقريب. */
export function buildDeductionSchedule(amount: number, installments: number, startYear: number, startMonth: number) {
  const count = Math.max(1, Math.floor(installments))
  const each = round3(amount / count)
  const rows: Array<{ year: number; month: number; amount: number }> = []
  for (let index = 0; index < count; index++) {
    const absolute = startYear * 12 + (startMonth - 1) + index
    rows.push({ year: Math.floor(absolute / 12), month: (absolute % 12) + 1, amount: index === count - 1 ? round3(amount - each * (count - 1)) : each })
  }
  return rows
}

/** أشهر الموظف المغلق/المدفوع راتبها (مغلق أو له قيد) — بمفاتيح YYYY-MM. */
export async function paidSalaryMonths(employeeId: number, months: Array<{ year: number; month: number }>) {
  if (!months.length) return new Set<string>()
  const keys = months.map((row) => monthKey(row.year, row.month))
  const rows = (await sql`
    SELECT sp.year, sp.month FROM payroll_tbl p JOIN salary_periods_tbl sp ON sp.id = p.period_id
    WHERE p.employee_id = ${employeeId} AND (COALESCE(p.is_closed, false) = true OR p.journal_id IS NOT NULL)
      AND (sp.year::text || '-' || LPAD(sp.month::text, 2, '0')) = ANY(${keys}::text[])
  `) as any[]
  return new Set(rows.map((row) => monthKey(Number(row.year), Number(row.month))))
}

export type SalaryDeductionLine = { deduction_id: number; deduction_type: SalaryDeductionType; label: string; amount: number }
export type SalaryDeductionTotals = { advance: number; loan: number; cash: number; total: number; lines: SalaryDeductionLine[] }

/** أقساط السلف والقروض والخصم النقدي المستحقة لكل موظف في شهر. */
export async function salaryDeductionTotals(year: number, month: number, employeeIds: number[]) {
  await ensureSalaryDeductionsSchema()
  const result = new Map<number, SalaryDeductionTotals>()
  if (!employeeIds.length) return result
  const rows = (await sql`
    SELECT s.employee_id, s.deduction_id, d.deduction_type, s.amount::float AS amount
    FROM employee_salary_deduction_schedule_tbl s JOIN employee_salary_deductions_tbl d ON d.id = s.deduction_id
    WHERE s.year = ${year} AND s.month = ${month} AND s.employee_id = ANY(${employeeIds}::int[])
    ORDER BY s.deduction_id
  `) as any[]
  for (const row of rows) {
    const type = row.deduction_type as SalaryDeductionType
    if (!isSalaryDeductionType(type)) continue
    const totals = result.get(Number(row.employee_id)) || { advance: 0, loan: 0, cash: 0, total: 0, lines: [] }
    const amount = round3(Number(row.amount))
    totals[type] = round3(totals[type] + amount)
    totals.total = round3(totals.total + amount)
    totals.lines.push({ deduction_id: Number(row.deduction_id), deduction_type: type, label: SALARY_DEDUCTION_TYPES[type].single, amount })
    result.set(Number(row.employee_id), totals)
  }
  return result
}

/**
 * بعد حفظ/حذف حركة: راتب الشهر المفتوح (غير المغلق) للموظف يُحدَّث فوراً — الخصومات لا تمس الضريبة فيكفي
 * استبدال القيم القديمة بالجديدة في الصافي.
 */
export async function syncOpenPayrollDeductions(employeeId: number, months: Array<{ year: number; month: number }>) {
  const seen = new Set<string>()
  for (const { year, month } of months) {
    const key = monthKey(year, month)
    if (seen.has(key)) continue
    seen.add(key)
    const totals = (await salaryDeductionTotals(year, month, [employeeId])).get(employeeId) || { advance: 0, loan: 0, cash: 0, total: 0, lines: [] }
    await sql`
      UPDATE payroll_tbl p SET
        net_salary = p.net_salary + COALESCE(p.advance_deductions, 0) + COALESCE(p.loan_deductions, 0) + COALESCE(p.cash_deductions, 0) - ${totals.total},
        advance_deductions = ${totals.advance}, loan_deductions = ${totals.loan}, cash_deductions = ${totals.cash},
        salary_deduction_details = ${JSON.stringify(totals.lines)}::jsonb
      FROM salary_periods_tbl sp
      WHERE sp.id = p.period_id AND sp.year = ${year} AND sp.month = ${month} AND p.employee_id = ${employeeId}
        AND COALESCE(p.is_closed, false) = false AND p.journal_id IS NULL
    `
  }
}

export async function salaryDeductionAccount(type: SalaryDeductionType) {
  const setting = SALARY_DEDUCTION_TYPES[type].setting
  const row = ((await sql`SELECT value FROM system_settings WHERE id::text = ${setting.id} LIMIT 1`) as any[])[0]
  return String(row?.value || "")
}

export async function saveSalaryDeductionAccount(type: SalaryDeductionType, accountId: string) {
  const setting = SALARY_DEDUCTION_TYPES[type].setting
  await sql`
    INSERT INTO system_settings (id, description, value) VALUES (${setting.id}, ${setting.description}, ${accountId})
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
  `
}
