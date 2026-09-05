import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureHrSchema } from "@/lib/hr-schema"
import { ensureTables as ensureVoucherTables, saveJournalRows, JOURNAL_TYPE_COUNTER_ACCOUNT } from "@/app/api/receipts/_lib"
import { buildVoucherCode } from "@/lib/voucher-code"
import { authorizeTransaction } from "@/lib/transaction-permissions"

const definitions: Record<string, { table: string; fields: string[]; order: string }> = {
  jobs: { table: "employee_jobs_tbl", fields: ["code", "name", "is_active"], order: "code" },
  "salary-items": { table: "salary_items_tbl", fields: ["code", "name", "other_name", "item_type", "calculation_type", "calculation_method", "amount_period", "add_to_total_salary", "default_amount", "taxable", "account_code", "is_active"], order: "code" },
  "tax-rules": { table: "tax_rules_tbl", fields: ["name", "from_amount", "to_amount", "rate", "fixed_amount", "is_active"], order: "from_amount" },
  "tax-exemptions": { table: "tax_exemptions_tbl", fields: ["name", "other_name", "tax_law_id", "exemption_nature", "exemption_value_type", "annual_amount", "max_amount", "max_amount_type", "is_active"], order: "id" },
}
const ident = (value: string) => `"${value.replace(/"/g, '""')}"`

async function getSalaryOpeningRows(year: number, month: number, excludeExisting = true) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`
  const rows = await sql`
    SELECT e.id, e.employee_code, e.full_name, e.other_name, e.department_id, e.job_id,
      e.salary_type, e.contract_type, e.salary_currency, e.tax_law_id, e.is_taxed,
      d.department_name, j.name AS job_name,
      COALESCE(c.currency_name, e.salary_currency, '') AS currency_name,
      first_item.calculated_amount AS basic_salary,
      COALESCE(SUM(CASE WHEN esi.id<>first_item.id AND si.item_type='earning' AND COALESCE(si.add_to_total_salary,true) THEN CASE WHEN COALESCE(si.calculation_method,si.calculation_type)='percentage' THEN first_item.calculated_amount*LEAST(esi.amount,100)/100 ELSE esi.amount*CASE WHEN COALESCE(si.amount_period,si.calculation_type)='daily' THEN ${daysInMonth} ELSE 1 END END ELSE 0 END), 0) AS earnings,
      COALESCE(SUM(CASE WHEN esi.id<>first_item.id AND si.item_type='deduction' THEN CASE WHEN COALESCE(si.calculation_method,si.calculation_type)='percentage' THEN first_item.calculated_amount*LEAST(esi.amount,100)/100 ELSE esi.amount*CASE WHEN COALESCE(si.amount_period,si.calculation_type)='daily' THEN ${daysInMonth} ELSE 1 END END ELSE 0 END), 0) AS deductions,
      COALESCE(SUM(CASE WHEN si.taxable THEN (CASE WHEN si.item_type='deduction' THEN -1 ELSE 1 END)*(CASE WHEN esi.id=first_item.id THEN first_item.calculated_amount WHEN COALESCE(si.calculation_method,si.calculation_type)='percentage' THEN first_item.calculated_amount*LEAST(esi.amount,100)/100 ELSE esi.amount*CASE WHEN COALESCE(si.amount_period,si.calculation_type)='daily' THEN ${daysInMonth} ELSE 1 END END) ELSE 0 END), 0) AS taxable_items,
      COALESCE((SELECT SUM(ete.amount) FROM employee_tax_exemptions_tbl ete WHERE ete.employee_id=e.id), 0) AS annual_exemptions,
      COALESCE((SELECT json_agg(json_build_object('from_amount',b.from_amount,'to_amount',b.to_amount,'tax_percent',b.tax_percent) ORDER BY b.from_amount) FROM tax_law_brackets_tbl b WHERE b.tax_law_id=e.tax_law_id), '[]') AS brackets
    FROM employees_tbl e
    JOIN departments d ON d.id=e.department_id AND COALESCE(d.is_active,true)
    JOIN employee_jobs_tbl j ON j.id=e.job_id AND j.is_active
    JOIN tax_laws_tbl tl ON tl.id=e.tax_law_id AND tl.is_active
    JOIN LATERAL (
      SELECT first_esi.id, first_esi.amount * CASE WHEN COALESCE(first_si.amount_period,first_si.calculation_type)='daily' THEN ${daysInMonth} ELSE 1 END AS calculated_amount
      FROM employee_salary_items_tbl first_esi
      JOIN salary_items_tbl first_si ON first_si.id=first_esi.salary_item_id AND first_si.is_active
      WHERE first_esi.employee_id=e.id
      ORDER BY first_esi.id
      LIMIT 1
    ) first_item ON true
    LEFT JOIN currency c ON c.id::text=e.salary_currency OR c.currency_code=e.salary_currency
    JOIN employee_salary_items_tbl esi ON esi.employee_id=e.id
    JOIN salary_items_tbl si ON si.id=esi.salary_item_id AND si.is_active
    WHERE e.status=1
      AND e.salary_currency IS NOT NULL AND e.salary_currency<>''
      AND e.hire_date<=${monthEnd}::date
      AND (e.end_date IS NULL OR e.end_date>=${monthStart}::date)
      AND (${excludeExisting} = false OR NOT EXISTS (
        SELECT 1 FROM payroll_tbl p JOIN salary_periods_tbl sp ON sp.id=p.period_id
        WHERE p.employee_id=e.id AND sp.year=${year} AND sp.month=${month}
      ))
    GROUP BY e.id,d.department_name,j.name,c.currency_name,first_item.id,first_item.calculated_amount
    ORDER BY e.employee_code
  `
  return rows.map((row: any) => {
    const basicSalary = Number(row.basic_salary) || 0
    const earnings = Number(row.earnings) || 0
    const deductions = Number(row.deductions) || 0
    const taxableAmount = Math.max(0, (Number(row.taxable_items) || basicSalary) - (Number(row.annual_exemptions) || 0) / 12)
    const bracket = (Array.isArray(row.brackets) ? row.brackets : []).filter((item: any) => taxableAmount >= Number(item.from_amount) && (item.to_amount == null || taxableAmount <= Number(item.to_amount))).at(-1)
    const incomeTax = row.is_taxed ? taxableAmount * (Number(bracket?.tax_percent) || 0) / 100 : 0
    return { ...row, selected: true, basic_salary: basicSalary, earnings, deductions, income_tax: incomeTax, total_salary: basicSalary + earnings - deductions, net_salary: basicSalary + earnings - deductions - incomeTax }
  })
}
const validateEmployee = (body: any) => {
  if (!body.department_id) return "القسم مطلوب"
  if (!body.job_id) return "الوظيفة مطلوبة"
  if (!body.salary_account) return "حساب صرف الراتب مطلوب"
  if (!body.salary_currency) return "عملة الراتب مطلوبة"
  const itemIds = (body.salary_items || []).map((item: any) => Number(item.salary_item_id)).filter(Boolean)
  if (!itemIds.length) return "يجب إضافة بند راتب واحد على الأقل"
  if (new Set(itemIds).size !== itemIds.length) return "بند الراتب - اسم البند مكرر لا يمكن الاستمرار"
  if (!body.tax_law_id) return "قانون الضريبة مطلوب"
  if (!body.father_account) return "حساب الأب مطلوب"
  if (!body.account_currency) return "عملة الحساب مطلوبة"
  return ""
}
const validateEmployeeSalaryPercentages = async (body: any) => {
  for (const row of body.salary_items || []) {
    const item = (await sql`SELECT name,COALESCE(calculation_method,calculation_type) calculation_method FROM salary_items_tbl WHERE id=${Number(row.salary_item_id) || 0}`)[0]
    if (item?.calculation_method === "percentage" && (Number(row.amount) < 0 || Number(row.amount) > 100)) return `البند - ${item.name}: النسبة يجب أن تكون أقل من أو تساوي 100`
  }
  return ""
}
const canonicalSalaryAccountId = async (storedValue: any) => {
  const rawValue = String(storedValue ?? "").trim()
  if (!rawValue) return ""
  const displayedCode = rawValue.split(/\s*-\s*|\s*\/\s*/)[0].trim()
  const numericId = Number(rawValue)
  let account = /^\d+$/.test(rawValue) && Number.isSafeInteger(numericId) && numericId <= 2147483647 ? (await sql`SELECT id FROM account_tbl WHERE id=${numericId} LIMIT 1`)[0] : null
  if (!account && displayedCode) account = (await sql`SELECT id FROM account_tbl WHERE LOWER(TRIM(code))=LOWER(${displayedCode}) LIMIT 1`)[0]
  return account ? String(account.id) : ""
}

export async function GET(request: NextRequest, { params }: { params: { resource: string } }) {
  await ensureHrSchema()
  const resource = params.resource
  try {
    if (definitions[resource]) {
      const d = definitions[resource]
      return NextResponse.json(await sql.unsafe(`SELECT * FROM ${ident(d.table)} ORDER BY ${ident(d.order)}`))
    }
    if (resource === "employee-number") {
      const settings = await sql`SELECT id,value FROM system_settings WHERE id IN ('employee_prefix','employee_start')`
      const values = Object.fromEntries(settings.map((row: any) => [row.id, row.value]))
      const prefix = String(values.employee_prefix || "E").trim().toUpperCase()
      const start = Math.max(1, Number(values.employee_start) || 1)
      const existing = await sql`SELECT employee_code FROM employees_tbl WHERE employee_code LIKE ${prefix + "%"}`
      const highest = existing.reduce((max: number, row: any) => { const suffix = String(row.employee_code || "").slice(prefix.length); return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max }, start - 1)
      const digits = Math.max(1, 10 - prefix.length)
      return NextResponse.json({ employeeNumber: `${prefix}${String(Math.max(start, highest + 1)).padStart(digits, "0")}`.slice(0, 10) })
    }
    if (resource === "employees") return NextResponse.json(await sql`SELECT e.*, d.department_name, j.name job_name, b.branch_name, COALESCE((SELECT json_agg(json_build_object('id',esi.id,'salary_item_id',esi.salary_item_id,'amount',esi.amount,'percentage',esi.percentage) ORDER BY esi.id) FROM employee_salary_items_tbl esi WHERE esi.employee_id=e.id),'[]') salary_items, COALESCE((SELECT json_agg(json_build_object('id',vt.id,'voucher_type_id',vt.id,'voucher_type_name',vt.name,'is_stopped',COALESCE(est.is_stopped,false),'stop_date',est.stop_date) ORDER BY vt.id) FROM voucher_types_tbl vt LEFT JOIN employee_stop_transactions_tbl est ON est.voucher_type_id=vt.id AND est.employee_id=e.id WHERE COALESCE(vt.status,1)<>3),'[]') stop_transactions, COALESCE((SELECT json_agg(json_build_object('id',ete.id,'tax_exemption_id',ete.tax_exemption_id,'exemption_type',ete.exemption_type,'amount',ete.amount) ORDER BY ete.id) FROM employee_tax_exemptions_tbl ete WHERE ete.employee_id=e.id),'[]') tax_exemptions FROM employees_tbl e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employee_jobs_tbl j ON j.id=e.job_id LEFT JOIN branches b ON b.id=e.branch_id ORDER BY e.employee_code`)
    if (resource === "tax-laws") return NextResponse.json(await sql`SELECT l.*, COALESCE(json_agg(json_build_object('id',b.id,'from_amount',b.from_amount,'to_amount',b.to_amount,'tax_percent',b.tax_percent) ORDER BY b.from_amount) FILTER (WHERE b.id IS NOT NULL),'[]') brackets FROM tax_laws_tbl l LEFT JOIN tax_law_brackets_tbl b ON b.tax_law_id=l.id GROUP BY l.id ORDER BY l.name`)
    if (resource === "lookups") {
      const [jobs, departments, branches, items, exemptions, taxLaws, currencies, voucherTypes] = await Promise.all([sql`SELECT * FROM employee_jobs_tbl WHERE is_active ORDER BY id`, sql`SELECT * FROM departments WHERE is_active ORDER BY id`, sql`SELECT * FROM branches WHERE is_active ORDER BY id`, sql`SELECT * FROM salary_items_tbl WHERE is_active ORDER BY id`, sql`SELECT * FROM tax_exemptions_tbl WHERE is_active ORDER BY id`, sql`SELECT * FROM tax_laws_tbl WHERE is_active ORDER BY id`, sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`, sql`SELECT id,name FROM voucher_types_tbl WHERE COALESCE(status,1)<>3 ORDER BY id`])
      return NextResponse.json({ jobs, departments, branches, items, exemptions, taxLaws, currencies, voucherTypes })
    }
    if (resource === "employee-items") return NextResponse.json(await sql`SELECT esi.*, e.employee_code, e.full_name, e.other_name, s.code item_code, s.name item_name, s.item_type, s.calculation_type FROM employee_salary_items_tbl esi JOIN employees_tbl e ON e.id=esi.employee_id JOIN salary_items_tbl s ON s.id=esi.salary_item_id ORDER BY e.employee_code,esi.id`)
    if (resource === "periods") return NextResponse.json(await sql`SELECT * FROM salary_periods_tbl ORDER BY year DESC, month DESC`)
    if (resource === "salary-opening") {
      const year = Number(request.nextUrl.searchParams.get("year"))
      const month = Number(request.nextUrl.searchParams.get("month"))
      if (!year || month < 1 || month > 12) return NextResponse.json({ error: "السنة والشهر مطلوبان" }, { status: 400 })
      return NextResponse.json(await getSalaryOpeningRows(year, month))
    }
    if (resource === "payroll") {
      const periodId = Number(request.nextUrl.searchParams.get("period_id") || 0)
      return NextResponse.json(await sql`SELECT p.*, e.employee_code,e.full_name,d.department_name FROM payroll_tbl p JOIN employees_tbl e ON e.id=p.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE p.period_id=${periodId} ORDER BY e.employee_code`)
    }
    if (resource === "salary-journal") {
      return NextResponse.json(await sql`
        SELECT p.*, sp.year, sp.month, e.employee_code, e.full_name, e.other_name, e.department_id, e.job_id,
          e.salary_type, e.contract_type, e.salary_currency, e.salary_account, e.branch_id,
          d.department_name, j.name AS job_name, c.id AS currency_id, COALESCE(c.currency_name,e.salary_currency,'') AS currency_name,
          p.basic_salary+p.earnings-p.deductions AS total_salary
        FROM payroll_tbl p
        JOIN salary_periods_tbl sp ON sp.id=p.period_id
        JOIN employees_tbl e ON e.id=p.employee_id
        LEFT JOIN departments d ON d.id=e.department_id
        LEFT JOIN employee_jobs_tbl j ON j.id=e.job_id
        LEFT JOIN currency c ON c.id::text=e.salary_currency OR c.currency_code=e.salary_currency
        ORDER BY sp.year DESC,sp.month DESC,e.employee_code
      `)
    }
    if (resource === "attendance-devices") return NextResponse.json(await sql`SELECT d.*, b.branch_name FROM attendance_devices_tbl d LEFT JOIN branches b ON b.id=d.branch_id ORDER BY d.name`)
    if (resource === "attendance-records") {
      const from = request.nextUrl.searchParams.get("from") || "1900-01-01"
      const to = request.nextUrl.searchParams.get("to") || "2999-12-31"
      const deviceId = Number(request.nextUrl.searchParams.get("device_id") || 0)
      return NextResponse.json(await sql`SELECT l.*, d.name device_name, e.full_name employee_name FROM attendance_logs_tbl l LEFT JOIN attendance_devices_tbl d ON d.id=l.device_id LEFT JOIN employees_tbl e ON e.id=l.employee_id WHERE l.punch_time >= ${from}::date AND l.punch_time < (${to}::date + INTERVAL '1 day') AND (${deviceId}=0 OR l.device_id=${deviceId}) ORDER BY l.punch_time DESC`)
    }
    if (resource === "shifts") return NextResponse.json(await sql`SELECT * FROM shift_definitions_tbl ORDER BY start_time, name`)
    if (resource === "shift-assignments") return NextResponse.json(await sql`SELECT a.*,e.employee_code,e.full_name employee_name,s.name shift_name,CASE a.weekday WHEN 0 THEN 'الأحد' WHEN 1 THEN 'الاثنين' WHEN 2 THEN 'الثلاثاء' WHEN 3 THEN 'الأربعاء' WHEN 4 THEN 'الخميس' WHEN 5 THEN 'الجمعة' WHEN 6 THEN 'السبت' END weekday_name FROM employee_shift_assignments_tbl a JOIN employees_tbl e ON e.id=a.employee_id LEFT JOIN shift_definitions_tbl s ON s.id=a.shift_id ORDER BY e.employee_code,a.weekday`)
    if (resource === "official-holidays") return NextResponse.json(await sql`SELECT h.*,COUNT(e.id)::int distributed_count FROM official_holidays_tbl h LEFT JOIN employee_holiday_exceptions_tbl e ON e.holiday_id=h.id GROUP BY h.id ORDER BY h.holiday_date DESC`)
    if (resource === "shift-schedules") return NextResponse.json(await sql`SELECT r.*,r.date_from work_date,e.employee_code,e.full_name employee_name,d.department_name,s.name shift_name,s.start_time,s.end_time,CASE EXTRACT(DOW FROM r.date_from) WHEN 0 THEN 'الأحد' WHEN 1 THEN 'الاثنين' WHEN 2 THEN 'الثلاثاء' WHEN 3 THEN 'الأربعاء' WHEN 4 THEN 'الخميس' WHEN 5 THEN 'الجمعة' WHEN 6 THEN 'السبت' END weekday_name FROM shift_schedule_rules_tbl r LEFT JOIN employees_tbl e ON e.id=r.employee_id LEFT JOIN departments d ON d.id=r.department_id LEFT JOIN shift_definitions_tbl s ON s.id=r.shift_id ORDER BY r.date_from ASC,e.employee_code`)
    return NextResponse.json({ error: "Unknown HR resource" }, { status: 404 })
  } catch (error) { console.error("HR GET", error); return NextResponse.json({ error: "تعذر تحميل البيانات" }, { status: 500 }) }
}

export async function POST(request: NextRequest, { params }: { params: { resource: string } }) {
  await ensureHrSchema(); const body = await request.json(); const resource = params.resource
  try {
    if (definitions[resource]) {
      if (resource === "salary-items" && (body.calculation_method || body.calculation_type) === "percentage" && (Number(body.default_amount) < 0 || Number(body.default_amount) > 100)) return NextResponse.json({ error: "النسبة يجب أن تكون أقل من أو تساوي 100" }, { status: 400 })
      const d = definitions[resource]; const fields = d.fields.filter(f => body[f] !== undefined)
      const values = fields.map(f => body[f]); const placeholders = fields.map((_, i) => `$${i + 1}`).join(",")
      const rows = await sql.unsafe(`INSERT INTO ${ident(d.table)} (${fields.map(ident).join(",")}) VALUES (${placeholders}) RETURNING *`, values)
      return NextResponse.json(rows[0], { status: 201 })
    }
    if (resource === "shifts") {
      if (!String(body.code || "").trim() || !String(body.name || "").trim()) return NextResponse.json({ error: "رمز الوردية واسمها مطلوبان" }, { status: 400 })
      const rows = await sql`INSERT INTO shift_definitions_tbl(code,name,start_time,end_time,break_minutes,grace_minutes,is_overnight,is_active) VALUES(${String(body.code).trim()},${String(body.name).trim()},${body.start_time || "08:00"},${body.end_time || "17:00"},${Number(body.break_minutes) || 0},${Number(body.grace_minutes) || 0},${body.is_overnight === true},${body.is_active !== false}) RETURNING *`
      return NextResponse.json(rows[0], { status: 201 })
    }
    if (resource === "shift-assignments") {
      if (!Number(body.employee_id) || Number(body.weekday) < 0 || Number(body.weekday) > 6) return NextResponse.json({ error: "الموظف واليوم مطلوبان" }, { status: 400 })
      if (!body.is_day_off && !Number(body.shift_id)) return NextResponse.json({ error: "اختر الوردية أو حدد اليوم عطلة" }, { status: 400 })
      const rows = await sql`INSERT INTO employee_shift_assignments_tbl(employee_id,weekday,shift_id,is_day_off) VALUES(${Number(body.employee_id)},${Number(body.weekday)},${body.is_day_off ? null : Number(body.shift_id)},${body.is_day_off === true}) ON CONFLICT(employee_id,weekday) DO UPDATE SET shift_id=EXCLUDED.shift_id,is_day_off=EXCLUDED.is_day_off RETURNING *`
      return NextResponse.json(rows[0], { status: 201 })
    }
    if (resource === "official-holidays") {
      if (body.action === "distribute") {
        const holidayId = Number(body.holiday_id)
        const holiday = (await sql`SELECT id FROM official_holidays_tbl WHERE id=${holidayId}`)[0]
        if (!holiday) return NextResponse.json({ error: "العطلة غير موجودة" }, { status: 404 })
        const employees = await sql`SELECT DISTINCT a.employee_id FROM employee_shift_assignments_tbl a JOIN employees_tbl e ON e.id=a.employee_id WHERE COALESCE(e.status,1)=1`
        for (const employee of employees) await sql`INSERT INTO employee_holiday_exceptions_tbl(holiday_id,employee_id,is_day_off) VALUES(${holidayId},${employee.employee_id},true) ON CONFLICT(holiday_id,employee_id) DO UPDATE SET is_day_off=true`
        return NextResponse.json({ ok: true, count: employees.length })
      }
      if (!String(body.name || "").trim() || !body.holiday_date || !body.end_date) return NextResponse.json({ error: "اسم العطلة والتاريخ مطلوبان" }, { status: 400 })
      if (String(body.end_date) < String(body.holiday_date)) return NextResponse.json({ error: "تاريخ النهاية غير صحيح" }, { status: 400 })
      const rows = await sql`INSERT INTO official_holidays_tbl(name,holiday_date,end_date,is_paid,notes) VALUES(${String(body.name).trim()},${body.holiday_date},${body.end_date},${body.is_paid !== false},${body.notes || null}) RETURNING *`
      return NextResponse.json(rows[0], { status: 201 })
    }
    if (resource === "shift-schedules") {
      const dateFrom = String(body.date_from || "")
      const dateTo = String(body.date_to || "")
      const weekday = Number(body.weekday)
      if (!dateFrom || !dateTo || dateTo < dateFrom || weekday < 0 || weekday > 6) return NextResponse.json({ error: "الفترة واليوم مطلوبة" }, { status: 400 })
      if (!body.employee_id && !body.department_id) return NextResponse.json({ error: "اختر موظفاً أو قسماً" }, { status: 400 })
      if (!body.is_day_off && !body.shift_id) return NextResponse.json({ error: "اختر الوردية أو حدد اليوم عطلة" }, { status: 400 })
      const values = body.department_id
        ? (await sql`SELECT id FROM employees_tbl WHERE department_id=${Number(body.department_id)} AND COALESCE(status,1)=1`).map((row: any) => ({ employeeId: Number(row.id), departmentId: null }))
        : [{ employeeId: Number(body.employee_id), departmentId: null }]
      let count = 0
      for (const target of values) {
        await sql`DELETE FROM shift_schedule_rules_tbl WHERE employee_id=${target.employeeId || null} AND date_from <= ${dateTo} AND date_to >= ${dateFrom}`
        for (let current = new Date(`${dateFrom}T00:00:00Z`); current <= new Date(`${dateTo}T00:00:00Z`); current.setUTCDate(current.getUTCDate() + 1)) {
          const date = current.toISOString().slice(0, 10)
          await sql`INSERT INTO shift_schedule_rules_tbl(employee_id,department_id,date_from,date_to,weekday,shift_id,is_day_off) VALUES(${target.employeeId || null},${target.departmentId || null},${date},${date},${current.getUTCDay()},${body.is_day_off ? null : Number(body.shift_id)},${body.is_day_off === true})`
          count++
        }
      }
      return NextResponse.json({ ok: true, count }, { status: 201 })
    }
    if (resource === "employees") {
      body.salary_account = await canonicalSalaryAccountId(body.salary_account)
      body.father_account = await canonicalSalaryAccountId(body.father_account || body.father_account_code)
      const validationError = validateEmployee(body); if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
      const percentageError = await validateEmployeeSalaryPercentages(body); if (percentageError) return NextResponse.json({ error: percentageError }, { status: 400 })
      const rows = await sql`INSERT INTO employees_tbl (employee_code,full_name,other_name,image_url,national_id,passport_no,gender,birth_date,hire_date,end_date,department_id,job_id,branch_id,salary_type,basic_salary,salary_currency,contract_type,bank_name,bank_branch,bank_account,iban,salary_account,phone,email,address,region,permanent_address,tax_exemption_id,tax_law_id,is_taxed,social_status,father_account_code,account_currency,allow_different_currency,currency_difference,stop_transactions,status,notes) VALUES (${body.employee_code},${body.full_name},${body.other_name||null},${body.image_url||null},${body.national_id||null},${body.passport_no||null},${body.gender||null},${body.birth_date||null},${body.hire_date},${body.end_date||null},${body.department_id||null},${body.job_id||null},${body.branch_id||null},${body.salary_type||"monthly"},${Number(body.basic_salary)||0},${body.salary_currency||null},${body.contract_type||null},${body.bank_name||null},${body.bank_branch||null},${body.bank_account||null},${body.iban||null},${body.salary_account||null},${body.phone||null},${body.email||null},${body.address||null},${body.region||null},${body.permanent_address||null},${body.tax_exemption_id||null},${body.tax_law_id||null},${body.is_taxed!==false},${body.social_status||null},${body.father_account_code||null},${body.account_currency||null},${body.allow_different_currency === true || String(body.allow_different_currency) === "1"},${!!body.currency_difference},${!!body.stop_transactions},${body.status??1},${body.notes||null}) RETURNING *`
      await sql`UPDATE employees_tbl SET father_account=${Number(body.father_account)} WHERE id=${rows[0].id}`
      for(const item of body.salary_items||[]) if(item.salary_item_id) await sql`INSERT INTO employee_salary_items_tbl(employee_id,salary_item_id,amount,percentage) VALUES(${rows[0].id},${item.salary_item_id},${Number(item.amount)||0},${Number(item.percentage)||0}) ON CONFLICT(employee_id,salary_item_id) DO UPDATE SET amount=EXCLUDED.amount,percentage=EXCLUDED.percentage`
      for(const item of body.tax_exemptions||[]) if(item.tax_exemption_id) await sql`INSERT INTO employee_tax_exemptions_tbl(employee_id,tax_exemption_id,exemption_type,amount) VALUES(${rows[0].id},${item.tax_exemption_id},${item.exemption_type||"annual"},${Number(item.amount)||0}) ON CONFLICT(employee_id,tax_exemption_id) DO UPDATE SET exemption_type=EXCLUDED.exemption_type,amount=EXCLUDED.amount`
      for(const item of body.stop_transactions||[]) if(item.is_stopped) await sql`INSERT INTO employee_stop_transactions_tbl(employee_id,voucher_type_id,is_stopped,stop_date) VALUES(${rows[0].id},${item.voucher_type_id},true,${item.stop_date||null}) ON CONFLICT(employee_id,voucher_type_id) DO UPDATE SET is_stopped=true,stop_date=EXCLUDED.stop_date`
      return NextResponse.json(rows[0], { status: 201 })
    }
    if (resource === "tax-laws") {
      const laws = await sql`INSERT INTO tax_laws_tbl(name,other_name,account_code,currency,max_discount,discount_percent,is_active) VALUES(${body.name},${body.other_name||""},${body.account_code||null},${body.currency||null},${body.max_discount===""?null:Number(body.max_discount)},${Number(body.discount_percent)||0},${body.is_active!==false}) RETURNING *`
      for (const bracket of body.brackets || []) await sql`INSERT INTO tax_law_brackets_tbl(tax_law_id,from_amount,to_amount,tax_percent) VALUES(${laws[0].id},${Number(bracket.from_amount)||0},${bracket.to_amount===""||bracket.to_amount==null?null:Number(bracket.to_amount)},${Number(bracket.tax_percent)||0})`
      return NextResponse.json(laws[0], { status: 201 })
    }
    if (resource === "employee-items") { const rows=await sql`INSERT INTO employee_salary_items_tbl(employee_id,salary_item_id,amount) VALUES(${body.employee_id},${body.salary_item_id},${Number(body.amount)||0}) ON CONFLICT(employee_id,salary_item_id) DO UPDATE SET amount=EXCLUDED.amount RETURNING *`; return NextResponse.json(rows[0]) }
    if (resource === "periods") { const rows=await sql`INSERT INTO salary_periods_tbl(year,month) VALUES(${body.year},${body.month}) ON CONFLICT(year,month) DO UPDATE SET status='open',closed_at=NULL RETURNING *`; return NextResponse.json(rows[0]) }
    if (resource === "salary-opening") {
      const year = Number(body.year), month = Number(body.month)
      const employeeIds = [...new Set((body.employee_ids || []).map(Number).filter(Boolean))]
      if (!year || month < 1 || month > 12) return NextResponse.json({ error: "السنة والشهر مطلوبان" }, { status: 400 })
      if (!employeeIds.length) return NextResponse.json({ error: "يجب اختيار موظف واحد على الأقل" }, { status: 400 })
      const eligible = (await getSalaryOpeningRows(year, month)).filter((row: any) => employeeIds.includes(Number(row.id)))
      if (!eligible.length) return NextResponse.json({ error: "لا يوجد موظفون مؤهلون لفتح راتب هذا الشهر" }, { status: 400 })
      const periods = await sql`INSERT INTO salary_periods_tbl(year,month,status) VALUES(${year},${month},'open') ON CONFLICT(year,month) DO UPDATE SET status='open',closed_at=NULL RETURNING id`
      for (const row of eligible as any[]) await sql`INSERT INTO payroll_tbl(period_id,employee_id,basic_salary,earnings,deductions,income_tax,net_salary) VALUES(${periods[0].id},${row.id},${row.basic_salary},${row.earnings},${row.deductions},${row.income_tax},${row.net_salary}) ON CONFLICT(period_id,employee_id) DO NOTHING`
      return NextResponse.json({ ok: true, count: eligible.length })
    }
    if (resource === "salary-journal") {
      const action = String(body.action || "")
      const payrollIds = [...new Set((body.payroll_ids || []).map(Number).filter(Boolean))]
      if (!payrollIds.length) return NextResponse.json({ error: "لا توجد رواتب لتنفيذ العملية" }, { status: 400 })
      if (action === "close") {
        const selected = await sql`SELECT id,period_id,COALESCE(is_closed,false) is_closed FROM payroll_tbl WHERE id=ANY(${payrollIds}::int[])`
        if (selected.length !== payrollIds.length) return NextResponse.json({ error: "تعذر العثور على جميع الرواتب المعروضة" }, { status: 400 })
        const periodIds = [...new Set(selected.map((row: any) => Number(row.period_id)))]
        if (periodIds.length !== 1) return NextResponse.json({ error: "يجب أن تكون الرواتب لشهر واحد" }, { status: 400 })
        const closedAt = new Date().toISOString()
        const closed = await sql`UPDATE payroll_tbl SET is_closed=true,closed_at=${closedAt}::timestamp WHERE id=ANY(${payrollIds}::int[]) AND COALESCE(is_closed,false)=false RETURNING id`
        await sql`UPDATE salary_periods_tbl SET status='closed',closed_at=${closedAt}::timestamp WHERE id=${periodIds[0]} AND NOT EXISTS (SELECT 1 FROM payroll_tbl p WHERE p.period_id=${periodIds[0]} AND COALESCE(p.is_closed,false)=false)`
        return NextResponse.json({ ok: true, closed_count: closed.length, all_closed: true, closed_at: closedAt })
      }
      if (action === "post") {
        const payrollRows = await sql`
          SELECT p.*,sp.year,sp.month,e.full_name,e.salary_account,e.salary_currency,e.branch_id,c.id currency_id,
            e.department_id,d.branch_id department_branch_id
          FROM payroll_tbl p JOIN salary_periods_tbl sp ON sp.id=p.period_id JOIN employees_tbl e ON e.id=p.employee_id
          LEFT JOIN departments d ON d.id=e.department_id
          LEFT JOIN currency c ON c.id::text=e.salary_currency OR c.currency_code=e.salary_currency
          WHERE p.id=ANY(${payrollIds}::int[]) ORDER BY p.id
        `
        if (payrollRows.some((row: any) => !row.is_closed)) return NextResponse.json({ error: "يجب إغلاق جميع الرواتب المعروضة قبل تنفيذ القيد" }, { status: 400 })
        const unposted = payrollRows.filter((row: any) => !Number(row.journal_id))
        if (!unposted.length) return NextResponse.json({ error: "جميع الرواتب المعروضة مرتبطة بقيد مسبقاً" }, { status: 400 })
        if (new Set(unposted.map((row: any) => `${row.year}-${row.month}`)).size !== 1) return NextResponse.json({ error: "يجب أن تكون الرواتب لشهر واحد" }, { status: 400 })
        if (new Set(unposted.map((row: any) => String(row.currency_id || row.salary_currency))).size !== 1) return NextResponse.json({ error: "يجب أن تكون الرواتب بعملة واحدة" }, { status: 400 })
        const selectedBranchId = Number(body.branch_id)
        if (!selectedBranchId) return NextResponse.json({ error: "يجب اختيار قسم مرتبط بفرع صحيح" }, { status: 400 })
        if (unposted.some((row: any) => Number(row.department_branch_id) !== selectedBranchId)) return NextResponse.json({ error: "فرع القسم المحدد لا يطابق بيانات الرواتب المعروضة" }, { status: 400 })

        const journalRows: any[] = []
        const rowErrors: Array<{ payroll_id: number; error: string }> = []
        let orderNo = 1
        const resolveAccount = async (storedValue: any, label: string, preferId = false) => {
          const rawValue = String(storedValue ?? "").trim()
          const code = rawValue.split(/\s*-\s*|\s*\/\s*/)[0].trim()
          let account
          const numericId = Number(rawValue)
          if (preferId && /^\d+$/.test(rawValue) && Number.isSafeInteger(numericId) && numericId <= 2147483647) account = (await sql`SELECT id FROM account_tbl WHERE id=${numericId} LIMIT 1`)[0]
          if (!account && code) account = (await sql`SELECT id FROM account_tbl WHERE LOWER(TRIM(code))=LOWER(${code}) LIMIT 1`)[0]
          if (!account && /^\d+$/.test(rawValue) && Number.isSafeInteger(numericId) && numericId <= 2147483647) account = (await sql`SELECT id FROM account_tbl WHERE id=${numericId} LIMIT 1`)[0]
          if (!account) throw new Error(`يجب تحديد حساب محاسبي صحيح لـ ${label}`)
          return Number(account.id)
        }
        for (const payroll of unposted as any[]) {
          try {
          const days = new Date(Number(payroll.year), Number(payroll.month), 0).getDate()
          const items = await sql`SELECT si.name,si.item_type,si.calculation_type,si.calculation_method,si.amount_period,si.add_to_total_salary,si.account_code,esi.amount FROM employee_salary_items_tbl esi JOIN salary_items_tbl si ON si.id=esi.salary_item_id WHERE esi.employee_id=${payroll.employee_id} ORDER BY esi.id`
          for (const item of items as any[]) {
            if (item.item_type === "earning" && item.add_to_total_salary === false) continue
            const amount = (item.calculation_method || item.calculation_type) === "percentage" ? Number(payroll.basic_salary) * Math.min(100, Number(item.amount || 0)) / 100 : Number(item.amount || 0) * ((item.amount_period || item.calculation_type) === "daily" ? days : 1)
            if (!amount) continue
            journalRows.push({ journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT, account_id: await resolveAccount(item.account_code, item.name), credit_debit: item.item_type === "deduction" ? 2 : 1, amount: Math.abs(amount), currency_id: Number(payroll.currency_id) || null, rate: 1, base_curr_amount: Math.abs(amount), note: `${item.name} - ${payroll.full_name}`.slice(0, 70), order_no: orderNo++, cost_centers: [] })
          }
          if (Number(payroll.income_tax) > 0) {
            const law = (await sql`SELECT tl.account_code,tl.name FROM employees_tbl e JOIN tax_laws_tbl tl ON tl.id=e.tax_law_id WHERE e.id=${payroll.employee_id}`)[0]
            journalRows.push({ journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT, account_id: await resolveAccount(law?.account_code, law?.name || "ضريبة الدخل"), credit_debit: 2, amount: Number(payroll.income_tax), currency_id: Number(payroll.currency_id) || null, rate: 1, base_curr_amount: Number(payroll.income_tax), note: `ضريبة الدخل - ${payroll.full_name}`.slice(0, 70), order_no: orderNo++, cost_centers: [] })
          }
          if (Number(payroll.net_salary) !== 0) journalRows.push({ journal_type_id: JOURNAL_TYPE_COUNTER_ACCOUNT, account_id: await resolveAccount(payroll.salary_account, `حساب صرف راتب ${payroll.full_name}`, true), credit_debit: Number(payroll.net_salary) > 0 ? 2 : 1, amount: Math.abs(Number(payroll.net_salary)), currency_id: Number(payroll.currency_id) || null, rate: 1, base_curr_amount: Math.abs(Number(payroll.net_salary)), note: `صافي راتب ${payroll.full_name}`.slice(0, 70), order_no: orderNo++, cost_centers: [] })
          } catch (error: any) {
            rowErrors.push({ payroll_id: Number(payroll.id), error: error?.message || "تعذر تجهيز قيد راتب الموظف" })
          }
        }
        if (rowErrors.length) return NextResponse.json({ error: "توجد أخطاء تمنع تنفيذ قيد الراتب", row_errors: rowErrors }, { status: 400 })
        const debit = journalRows.filter(row => row.credit_debit === 1).reduce((sum, row) => sum + row.amount, 0)
        const credit = journalRows.filter(row => row.credit_debit === 2).reduce((sum, row) => sum + row.amount, 0)
        if (Math.abs(debit-credit) > 0.01) return NextResponse.json({ error: `قيد الراتب غير متوازن: المدين ${debit.toFixed(3)} والدائن ${credit.toFixed(3)}` }, { status: 400 })
        await ensureVoucherTables()
        const authorization = await authorizeTransaction(request, "journal", "create", selectedBranchId)
        if (!authorization.ok) return authorization.response
        const postingAuthorization = await authorizeTransaction(request, "journal", "post", authorization.branchId)
        if (!postingAuthorization.ok) return postingAuthorization.response
        const userSetting = (await sql`SELECT id FROM user_settings WHERE user_id=${authorization.userId} LIMIT 1`)[0]
        if (!userSetting?.id) return NextResponse.json({ error: "تعذر تحديد المستخدم الذي ينفذ قيد الراتب" }, { status: 400 })
        const bookPermission = (await sql`
          SELECT p.vch_book_id,b.name
          FROM voucher_book_user_permissions_tbl p
          JOIN voucher_books_tbl b ON b.id=p.vch_book_id
          WHERE p.user_id=${userSetting.id} AND p.voucher_type_id=3
          ORDER BY COALESCE(p.is_default,0) DESC,p.vch_book_id
          LIMIT 1
        `)[0]
        if (!bookPermission?.vch_book_id) return NextResponse.json({ error: "يجب تحديد دفتر سندات افتراضي لسند القيد للمستخدم" }, { status: 400 })
        const numberSettings = await sql`SELECT id,value FROM system_settings WHERE id IN ('journal_prefix','journal_start')`
        const settingValues = Object.fromEntries(numberSettings.map((row: any) => [row.id,row.value]))
        const prefix = /^[A-Z]{1,3}$/.test(String(settingValues.journal_prefix || "J").trim().toUpperCase()) ? String(settingValues.journal_prefix || "J").trim().toUpperCase() : "J"
        const startNumber = Math.max(1,Number(settingValues.journal_start)||1)
        const codePrefix = `${prefix}${bookPermission.name}`
        const existingCodes = await sql`SELECT vch_code FROM voucher_header_tbl WHERE vch_type=3 AND vch_code LIKE ${codePrefix+"%"}`
        const maximum = existingCodes.reduce((max: number,row: any) => { const suffix=String(row.vch_code||"").slice(codePrefix.length); return Math.max(max,Number(suffix.match(/(\d+)$/)?.[1]||0)) },0)
        const code = buildVoucherCode(prefix,String(bookPermission.name),Math.max(startNumber,maximum+1))
        const currencyId = Number(unposted[0].currency_id) || null
        const date = `${unposted[0].year}-${String(unposted[0].month).padStart(2,"0")}-${String(new Date(Number(unposted[0].year),Number(unposted[0].month),0).getDate()).padStart(2,"0")}`
        const vouchers = await sql`INSERT INTO voucher_header_tbl(vch_type,vch_code,vch_date,vch_book_id,branch_id,currency_id,rate,amount,note,status,vch_status,is_printed,insert_user) VALUES(3,${code},${date},${bookPermission.vch_book_id},${authorization.branchId},${currencyId},1,${debit},${`قيد رواتب ${unposted[0].month}/${unposted[0].year}`},2,2,0,${userSetting.id}) RETURNING id,vch_code,vch_book_id,insert_user`
        await saveJournalRows(Number(vouchers[0].id),journalRows)
        const ids = unposted.map((row: any) => Number(row.id))
        await sql`UPDATE payroll_tbl SET journal_id=${vouchers[0].id} WHERE id=ANY(${ids}::int[])`
        return NextResponse.json({ ok: true, journal_id: vouchers[0].id, journal_code: vouchers[0].vch_code })
      }
      return NextResponse.json({ error: "العملية غير معروفة" }, { status: 400 })
    }
    if (resource === "payroll") {
      const periodId = Number(body.period_id)
      const period = (await sql`SELECT year,month,status FROM salary_periods_tbl WHERE id=${periodId}`)[0]
      if (!period) return NextResponse.json({ error: "فترة الراتب غير موجودة" }, { status: 404 })
      if (period.status === "closed") return NextResponse.json({ error: "لا يمكن إعادة احتساب فترة راتب مغلقة" }, { status: 400 })

      const calculatedRows = await getSalaryOpeningRows(Number(period.year), Number(period.month), false)
      await sql`DELETE FROM payroll_tbl WHERE period_id=${periodId}`
      for (const row of calculatedRows) {
        await sql`INSERT INTO payroll_tbl(period_id,employee_id,basic_salary,earnings,deductions,income_tax,net_salary)
          VALUES(${periodId},${row.id},${row.basic_salary},${row.earnings},${row.deductions},${row.income_tax},${row.net_salary})`
      }
      return NextResponse.json({ ok: true, count: calculatedRows.length })
    }
    if (resource === "attendance-devices") {
      if (!String(body.name || "").trim() || !String(body.code || "").trim() || !String(body.ip_address || "").trim()) return NextResponse.json({ error: "اسم الجهاز والرمز والعنوان مطلوبون" }, { status: 400 })
      const rows = await sql`INSERT INTO attendance_devices_tbl(name,code,device_type,ip_address,port,branch_id,is_active) VALUES(${String(body.name).trim()},${String(body.code).trim()},${body.device_type || "zkteco"},${String(body.ip_address).trim()},${Number(body.port) || 4370},${body.branch_id || null},${body.is_active !== false}) RETURNING *`
      return NextResponse.json(rows[0], { status: 201 })
    }
    if (resource === "attendance-records") {
      if (body.action === "read") return NextResponse.json({ count: 0, message: "قراءة الجهاز تحتاج موصل البروتوكول الخاص بالطراز" })
      if (!String(body.employee_code || "").trim() || !body.punch_time) return NextResponse.json({ error: "رقم الموظف ووقت الحركة مطلوبان" }, { status: 400 })
      const employee = body.employee_id ? { id: Number(body.employee_id) } : (await sql`SELECT id FROM employees_tbl WHERE employee_code=${String(body.employee_code).trim()} LIMIT 1`)[0]
      const rows = await sql`INSERT INTO attendance_logs_tbl(device_id,employee_id,employee_code,device_user_id,punch_time,punch_type,verification_type,sync_status,notes) VALUES(${body.device_id || null},${employee?.id || null},${String(body.employee_code).trim()},${body.device_user_id || body.employee_code},${body.punch_time}::timestamp,${body.punch_type || "unknown"},${body.verification_type || "manual"},${body.sync_status || "manual"},${body.notes || null}) ON CONFLICT(device_id,device_user_id,punch_time) DO UPDATE SET employee_id=EXCLUDED.employee_id,punch_type=EXCLUDED.punch_type,verification_type=EXCLUDED.verification_type,notes=EXCLUDED.notes RETURNING *`
      return NextResponse.json(rows[0], { status: 201 })
    }
    return NextResponse.json({ error:"Unknown HR resource" },{status:404})
  } catch(error:any) { console.error("HR POST",error); return NextResponse.json({error:error?.message||"تعذر حفظ البيانات"},{status:500}) }
}

export async function PUT(request: NextRequest, { params }: { params: { resource: string } }) {
  await ensureHrSchema(); const body=await request.json(); const resource=params.resource
  try {
    if (definitions[resource]) { if (resource === "salary-items" && (body.calculation_method || body.calculation_type) === "percentage" && (Number(body.default_amount) < 0 || Number(body.default_amount) > 100)) return NextResponse.json({ error: "النسبة يجب أن تكون أقل من أو تساوي 100" }, { status: 400 }); const d=definitions[resource]; const fields=d.fields.filter(f=>body[f]!==undefined); const values=fields.map(f=>body[f]); values.push(body.id); const sets=fields.map((f,i)=>`${ident(f)}=$${i+1}`).join(","); const rows=await sql.unsafe(`UPDATE ${ident(d.table)} SET ${sets} WHERE id=$${values.length} RETURNING *`,values); return NextResponse.json(rows[0]) }
    if(resource==="employees") { body.father_account = await canonicalSalaryAccountId(body.father_account || body.father_account_code); if (body.id && body.father_account) await sql`UPDATE employees_tbl SET father_account=${Number(body.father_account)} WHERE id=${body.id}` }
    if(resource==="employees") { body.salary_account = await canonicalSalaryAccountId(body.salary_account); const validationError = validateEmployee(body); if (validationError) return NextResponse.json({ error: validationError }, { status: 400 }); const rows=await sql`UPDATE employees_tbl SET employee_code=${body.employee_code},full_name=${body.full_name},other_name=${body.other_name||null},image_url=${body.image_url||null},national_id=${body.national_id||null},passport_no=${body.passport_no||null},gender=${body.gender||null},birth_date=${body.birth_date||null},hire_date=${body.hire_date},end_date=${body.end_date||null},department_id=${body.department_id||null},job_id=${body.job_id||null},branch_id=${body.branch_id||null},salary_type=${body.salary_type||"monthly"},basic_salary=${Number(body.basic_salary)||0},salary_currency=${body.salary_currency||null},contract_type=${body.contract_type||null},bank_name=${body.bank_name||null},bank_branch=${body.bank_branch||null},bank_account=${body.bank_account||null},iban=${body.iban||null},salary_account=${body.salary_account||null},phone=${body.phone||null},email=${body.email||null},address=${body.address||null},region=${body.region||null},permanent_address=${body.permanent_address||null},tax_exemption_id=${body.tax_exemption_id||null},tax_law_id=${body.tax_law_id||null},is_taxed=${body.is_taxed!==false},social_status=${body.social_status||null},father_account_code=${body.father_account_code||null},account_currency=${body.account_currency||null},allow_different_currency=${body.allow_different_currency === true || String(body.allow_different_currency) === "1"},currency_difference=${!!body.currency_difference},stop_transactions=${!!body.stop_transactions},status=${body.status??1},notes=${body.notes||null},updated_at=CURRENT_TIMESTAMP WHERE id=${body.id} RETURNING *`; await sql`DELETE FROM employee_salary_items_tbl WHERE employee_id=${body.id}`; for(const item of body.salary_items||[]) if(item.salary_item_id) await sql`INSERT INTO employee_salary_items_tbl(employee_id,salary_item_id,amount,percentage) VALUES(${body.id},${item.salary_item_id},${Number(item.amount)||0},${Number(item.percentage)||0}) ON CONFLICT(employee_id,salary_item_id) DO UPDATE SET amount=EXCLUDED.amount,percentage=EXCLUDED.percentage`; await sql`DELETE FROM employee_tax_exemptions_tbl WHERE employee_id=${body.id}`; for(const item of body.tax_exemptions||[]) if(item.tax_exemption_id) await sql`INSERT INTO employee_tax_exemptions_tbl(employee_id,tax_exemption_id,exemption_type,amount) VALUES(${body.id},${item.tax_exemption_id},${item.exemption_type||"annual"},${Number(item.amount)||0}) ON CONFLICT(employee_id,tax_exemption_id) DO UPDATE SET exemption_type=EXCLUDED.exemption_type,amount=EXCLUDED.amount`; await sql`DELETE FROM employee_stop_transactions_tbl WHERE employee_id=${body.id}`; for(const item of body.stop_transactions||[]) if(item.is_stopped) await sql`INSERT INTO employee_stop_transactions_tbl(employee_id,voucher_type_id,is_stopped,stop_date) VALUES(${body.id},${item.voucher_type_id},true,${item.stop_date||null})`; return NextResponse.json(rows[0]) }
    if(resource==="tax-laws") { const rows=await sql`UPDATE tax_laws_tbl SET name=${body.name},other_name=${body.other_name||""},account_code=${body.account_code||null},currency=${body.currency||null},max_discount=${body.max_discount===""?null:Number(body.max_discount)},discount_percent=${Number(body.discount_percent)||0},is_active=${body.is_active!==false},updated_at=CURRENT_TIMESTAMP WHERE id=${body.id} RETURNING *`; await sql`DELETE FROM tax_law_brackets_tbl WHERE tax_law_id=${body.id}`; for(const bracket of body.brackets||[]) await sql`INSERT INTO tax_law_brackets_tbl(tax_law_id,from_amount,to_amount,tax_percent) VALUES(${body.id},${Number(bracket.from_amount)||0},${bracket.to_amount===""||bracket.to_amount==null?null:Number(bracket.to_amount)},${Number(bracket.tax_percent)||0})`; return NextResponse.json(rows[0]) }
    if(resource==="periods"&&body.action==="close") { const rows=await sql`UPDATE salary_periods_tbl SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE id=${body.id} RETURNING *`; return NextResponse.json(rows[0]) }
    if(resource==="attendance-devices") { const rows=await sql`UPDATE attendance_devices_tbl SET name=${String(body.name).trim()},code=${String(body.code).trim()},device_type=${body.device_type||"zkteco"},ip_address=${String(body.ip_address).trim()},port=${Number(body.port)||4370},branch_id=${body.branch_id||null},is_active=${body.is_active!==false},updated_at=CURRENT_TIMESTAMP WHERE id=${body.id} RETURNING *`; return NextResponse.json(rows[0]) }
    if(resource==="shifts") { const rows=await sql`UPDATE shift_definitions_tbl SET code=${String(body.code).trim()},name=${String(body.name).trim()},start_time=${body.start_time||"08:00"},end_time=${body.end_time||"17:00"},break_minutes=${Number(body.break_minutes)||0},grace_minutes=${Number(body.grace_minutes)||0},is_overnight=${body.is_overnight===true},is_active=${body.is_active!==false},updated_at=CURRENT_TIMESTAMP WHERE id=${body.id} RETURNING *`; return NextResponse.json(rows[0]) }
    if(resource==="shift-schedules") {
      if (!body.id || (!body.is_day_off && !body.shift_id)) return NextResponse.json({ error: "اختر الوردية أو حدد اليوم عطلة" }, { status: 400 })
      const current = (await sql`SELECT employee_id,date_from,weekday FROM shift_schedule_rules_tbl WHERE id=${body.id}`)[0]
      if (!current) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
      const applyWeekday = body.apply_weekday === true
      const applyEmployees = body.apply_employees === true
      const rows = applyWeekday && applyEmployees
        ? await sql`UPDATE shift_schedule_rules_tbl SET shift_id=${body.is_day_off ? null : Number(body.shift_id)},is_day_off=${body.is_day_off === true} WHERE weekday=${current.weekday} RETURNING *`
        : applyWeekday
          ? await sql`UPDATE shift_schedule_rules_tbl SET shift_id=${body.is_day_off ? null : Number(body.shift_id)},is_day_off=${body.is_day_off === true} WHERE employee_id=${current.employee_id} AND weekday=${current.weekday} RETURNING *`
          : applyEmployees
            ? await sql`UPDATE shift_schedule_rules_tbl SET shift_id=${body.is_day_off ? null : Number(body.shift_id)},is_day_off=${body.is_day_off === true} WHERE date_from=${current.date_from} AND date_to=${current.date_from} RETURNING *`
            : await sql`UPDATE shift_schedule_rules_tbl SET shift_id=${body.is_day_off ? null : Number(body.shift_id)},is_day_off=${body.is_day_off === true} WHERE id=${body.id} RETURNING *`
      return NextResponse.json(rows[0])
    }
    if(resource==="official-holidays") { const rows=await sql`UPDATE official_holidays_tbl SET name=${String(body.name).trim()},holiday_date=${body.holiday_date},end_date=${body.end_date},is_paid=${body.is_paid!==false},notes=${body.notes||null} WHERE id=${body.id} RETURNING *`; return NextResponse.json(rows[0]) }
    return NextResponse.json({error:"Unknown HR resource"},{status:404})
  } catch(error:any){ return NextResponse.json({error:error?.message||"تعذر التعديل"},{status:500}) }
}

export async function DELETE(request:NextRequest,{params}:{params:{resource:string}}){ await ensureHrSchema(); const id=Number(request.nextUrl.searchParams.get("id")); if(params.resource==="attendance-devices"&&id){await sql`DELETE FROM attendance_devices_tbl WHERE id=${id}`;return NextResponse.json({ok:true})} if(params.resource==="shifts"&&id){await sql`DELETE FROM shift_definitions_tbl WHERE id=${id}`;return NextResponse.json({ok:true})} if(params.resource==="shift-assignments"&&id){await sql`DELETE FROM employee_shift_assignments_tbl WHERE id=${id}`;return NextResponse.json({ok:true})} if(params.resource==="official-holidays"&&id){await sql`DELETE FROM official_holidays_tbl WHERE id=${id}`;return NextResponse.json({ok:true})} if(params.resource==="tax-laws"&&id){await sql`DELETE FROM tax_laws_tbl WHERE id=${id}`;return NextResponse.json({ok:true})} if(params.resource==="employees"&&id){try{await sql`DELETE FROM payroll_tbl WHERE employee_id=${id}`;await sql`DELETE FROM employee_stop_transactions_tbl WHERE employee_id=${id}`;await sql`DELETE FROM employee_tax_exemptions_tbl WHERE employee_id=${id}`;await sql`DELETE FROM employee_salary_items_tbl WHERE employee_id=${id}`;await sql`DELETE FROM employees_tbl WHERE id=${id}`;return NextResponse.json({ok:true})}catch(error){console.error("[hr/employees] delete failed",error);return NextResponse.json({error:"تعذر حذف الموظف لوجود حركات مرتبطة به"},{status:409})}} const d=definitions[params.resource]; if(!d||!id)return NextResponse.json({error:"Invalid request"},{status:400}); await sql.unsafe(`DELETE FROM ${ident(d.table)} WHERE id=$1`,[id]); return NextResponse.json({ok:true}) }
