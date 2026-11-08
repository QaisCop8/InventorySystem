import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeTransaction, type TransactionAction, type TransactionFamily } from "@/lib/transaction-permissions"
import { validateLeafAccountFields } from "@/lib/leaf-accounts"
import {
  SALARY_DEDUCTION_TYPES,
  buildDeductionSchedule,
  ensureSalaryDeductionsSchema,
  isSalaryDeductionType,
  paidSalaryMonths,
  saveSalaryDeductionAccount,
  salaryDeductionAccount,
  syncOpenPayrollDeductions,
  type SalaryDeductionType,
} from "@/lib/salary-deductions"

// السلف / القروض / الخصم النقدي — lib/salary-deductions.ts
//   GET    ?type=advance|loan|cash&year&month&employee_ids     ·   GET ?type&settings=1
//   POST   { type, employee_id, doc_date, amount, installments?, start_year, start_month, notes }
//   POST   { type, action: "save-settings", account_id }
//   PUT    { id, ...نفس الحقول }   ·   DELETE ?id

const FAMILY: Record<SalaryDeductionType, TransactionFamily> = {
  advance: "hr_salary_advances",
  loan: "hr_salary_loans",
  cash: "hr_cash_deductions",
}
const isoDate = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null)
const round3 = (value: number) => Math.round((Number(value) || 0) * 1000) / 1000
const ids = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)

async function authorize(request: NextRequest, type: SalaryDeductionType, action: TransactionAction) {
  if (!(await getSessionUser(request))) return { ok: false as const, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }
  return authorizeTransaction(request, FAMILY[type], action)
}

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams
    const type = p.get("type")
    if (!isSalaryDeductionType(type)) return NextResponse.json({ error: "نوع الحركة غير صالح" }, { status: 400 })
    const authorization = await authorize(request, type, "view")
    if (!authorization.ok) return authorization.response
    await ensureSalaryDeductionsSchema()
    if (p.get("settings") === "1") {
      const accountId = await salaryDeductionAccount(type)
      const account = /^\d+$/.test(accountId) ? ((await sql`SELECT id, code, name FROM account_tbl WHERE id = ${Number(accountId)} LIMIT 1`) as any[])[0] : null
      return NextResponse.json({ account_id: accountId, account: account || null })
    }
    const year = Number(p.get("year")) || 0
    const month = Number(p.get("month")) || 0
    const employeeIds = ids(p.get("employee_ids"))
    // الحركات التي يقع أحد أقساطها في الشهر المختار (أو كل الحركات بلا شهر)، مع المسدَّد = أقساط أشهر رواتب مغلقة/مدفوعة
    const rows = await sql`
      SELECT d.id, d.deduction_type, d.employee_id, e.employee_code, e.full_name AS employee_name, dep.department_name,
        d.doc_date::text AS doc_date, d.amount::float AS amount, d.installments, d.start_year, d.start_month, d.notes,
        to_char(d.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
        COALESCE((SELECT json_agg(json_build_object('year', s.year, 'month', s.month, 'amount', s.amount::float,
          'paid', EXISTS (SELECT 1 FROM payroll_tbl pr JOIN salary_periods_tbl sp ON sp.id = pr.period_id
            WHERE pr.employee_id = s.employee_id AND sp.year = s.year AND sp.month = s.month
              AND (COALESCE(pr.is_closed, false) = true OR pr.journal_id IS NOT NULL))) ORDER BY s.year, s.month)
          FROM employee_salary_deduction_schedule_tbl s WHERE s.deduction_id = d.id), '[]') AS schedule
      FROM employee_salary_deductions_tbl d
      JOIN employees_tbl e ON e.id = d.employee_id
      LEFT JOIN departments dep ON dep.id = e.department_id
      WHERE d.deduction_type = ${type}
        AND (${employeeIds.length === 0} OR d.employee_id = ANY(${employeeIds}::int[]))
        AND (${year === 0} OR EXISTS (SELECT 1 FROM employee_salary_deduction_schedule_tbl s
          WHERE s.deduction_id = d.id AND s.year = ${year} AND (${month === 0} OR s.month = ${month})))
      ORDER BY d.doc_date DESC, d.id DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Salary deductions GET error:", error)
    return NextResponse.json({ error: "تعذر تحميل البيانات" }, { status: 500 })
  }
}

async function validate(type: SalaryDeductionType, body: any) {
  const employeeId = Number(body.employee_id) || 0
  const docDate = isoDate(body.doc_date)
  const amount = round3(Number(body.amount))
  const installments = type === "loan" ? Math.floor(Number(body.installments) || 0) : 1
  const startYear = Number(body.start_year) || 0
  const startMonth = Number(body.start_month) || 0
  if (!employeeId) return { error: "الموظف مطلوب" }
  if (!docDate) return { error: "التاريخ مطلوب" }
  if (!(amount > 0)) return { error: "المبلغ يجب أن يكون أكبر من صفر" }
  if (type === "loan" && (installments < 1 || installments > 120)) return { error: "عدد الأقساط يجب أن يكون بين 1 و 120" }
  if (startYear < 2000 || startYear > 2100 || startMonth < 1 || startMonth > 12) return { error: "شهر الخصم من الراتب مطلوب" }
  const employee = ((await sql`SELECT id, full_name FROM employees_tbl WHERE id = ${employeeId} LIMIT 1`) as any[])[0]
  if (!employee) return { error: "الموظف غير موجود" }
  const schedule = buildDeductionSchedule(amount, installments, startYear, startMonth)
  return { employeeId, employeeName: String(employee.full_name || ""), docDate, amount, installments, startYear, startMonth, schedule, notes: String(body.notes || "").trim() || null }
}

/** رسالة منع الحفظ إن وقع أحد الأشهر في راتب مغلق/مدفوع للموظف. */
async function paidMonthsError(employeeId: number, months: Array<{ year: number; month: number }>, verb: string) {
  const paid = await paidSalaryMonths(employeeId, months)
  if (!paid.size) return null
  const list = [...paid].sort().map((key) => `${Number(key.slice(5))}/${key.slice(0, 4)}`).join("، ")
  return `لا يمكن ${verb}: راتب الموظف للشهر ${list} مغلق/مدفوع`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const type = body?.type
    if (!isSalaryDeductionType(type)) return NextResponse.json({ error: "نوع الحركة غير صالح" }, { status: 400 })
    const isSettings = body.action === "save-settings"
    const authorization = await authorize(request, type, isSettings ? "update" : "create")
    if (!authorization.ok) return authorization.response
    await ensureSalaryDeductionsSchema()

    if (isSettings) {
      const accountId = String(body.account_id || "").trim()
      if (accountId) {
        const leafError = await validateLeafAccountFields({ [SALARY_DEDUCTION_TYPES[type].setting.description]: accountId })
        if (leafError) return NextResponse.json({ error: leafError }, { status: 400 })
      }
      await saveSalaryDeductionAccount(type, accountId)
      return NextResponse.json({ ok: true })
    }

    const input = await validate(type, body)
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 })
    const blocked = await paidMonthsError(input.employeeId, input.schedule, "الحفظ")
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

    const userId = Number(authorization.userId) || null
    const created = ((await sql`
      INSERT INTO employee_salary_deductions_tbl (deduction_type, employee_id, doc_date, amount, installments, start_year, start_month, notes, created_by)
      VALUES (${type}, ${input.employeeId}, ${input.docDate}::date, ${input.amount}, ${input.installments}, ${input.startYear}, ${input.startMonth}, ${input.notes}, ${userId})
      RETURNING id
    `) as any[])[0]
    for (const row of input.schedule) {
      await sql`INSERT INTO employee_salary_deduction_schedule_tbl (deduction_id, employee_id, year, month, amount) VALUES (${created.id}, ${input.employeeId}, ${row.year}, ${row.month}, ${row.amount})`
    }
    await syncOpenPayrollDeductions(input.employeeId, input.schedule)
    return NextResponse.json({ ok: true, id: created.id })
  } catch (error) {
    console.error("Salary deductions POST error:", error)
    return NextResponse.json({ error: "تعذر الحفظ" }, { status: 500 })
  }
}

async function loadExisting(id: number) {
  const row = ((await sql`SELECT id, deduction_type, employee_id FROM employee_salary_deductions_tbl WHERE id = ${id} LIMIT 1`) as any[])[0]
  if (!row) return null
  const schedule = ((await sql`SELECT year, month FROM employee_salary_deduction_schedule_tbl WHERE deduction_id = ${id}`) as any[])
    .map((item) => ({ year: Number(item.year), month: Number(item.month) }))
  return { ...row, schedule }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    await ensureSalaryDeductionsSchema()
    const existing = await loadExisting(Number(body?.id) || 0)
    if (!existing || !isSalaryDeductionType(existing.deduction_type)) return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 })
    const type = existing.deduction_type as SalaryDeductionType
    const authorization = await authorize(request, type, "update")
    if (!authorization.ok) return authorization.response

    const input = await validate(type, body)
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 })
    // القديم والجديد: لا يُغيَّر قسط دخل راتباً مدفوعاً، ولا يُضاف قسط إلى راتب مدفوع
    const blockedOld = await paidMonthsError(Number(existing.employee_id), existing.schedule, "التعديل")
    if (blockedOld) return NextResponse.json({ error: blockedOld }, { status: 409 })
    const blockedNew = await paidMonthsError(input.employeeId, input.schedule, "التعديل")
    if (blockedNew) return NextResponse.json({ error: blockedNew }, { status: 409 })

    const userId = Number(authorization.userId) || null
    await sql`
      UPDATE employee_salary_deductions_tbl SET employee_id = ${input.employeeId}, doc_date = ${input.docDate}::date, amount = ${input.amount},
        installments = ${input.installments}, start_year = ${input.startYear}, start_month = ${input.startMonth}, notes = ${input.notes},
        updated_by = ${userId}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${existing.id}
    `
    await sql`DELETE FROM employee_salary_deduction_schedule_tbl WHERE deduction_id = ${existing.id}`
    for (const row of input.schedule) {
      await sql`INSERT INTO employee_salary_deduction_schedule_tbl (deduction_id, employee_id, year, month, amount) VALUES (${existing.id}, ${input.employeeId}, ${row.year}, ${row.month}, ${row.amount})`
    }
    await syncOpenPayrollDeductions(Number(existing.employee_id), existing.schedule)
    await syncOpenPayrollDeductions(input.employeeId, input.schedule)
    return NextResponse.json({ ok: true, id: existing.id })
  } catch (error) {
    console.error("Salary deductions PUT error:", error)
    return NextResponse.json({ error: "تعذر الحفظ" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureSalaryDeductionsSchema()
    const existing = await loadExisting(Number(request.nextUrl.searchParams.get("id")) || 0)
    if (!existing || !isSalaryDeductionType(existing.deduction_type)) return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 })
    const authorization = await authorize(request, existing.deduction_type as SalaryDeductionType, "delete")
    if (!authorization.ok) return authorization.response
    const blocked = await paidMonthsError(Number(existing.employee_id), existing.schedule, "الحذف")
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })
    await sql`DELETE FROM employee_salary_deductions_tbl WHERE id = ${existing.id}`
    await syncOpenPayrollDeductions(Number(existing.employee_id), existing.schedule)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Salary deductions DELETE error:", error)
    return NextResponse.json({ error: "تعذر الحذف" }, { status: 500 })
  }
}

