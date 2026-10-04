import sql from "@/lib/database"
import { saveJournalRows } from "@/app/api/receipts/_lib"

export const FIXED_ASSET_DEPRECIATION_VCH_TYPE = 99

export const FIXED_ASSET_DEPRECIATION_METHODS = [
  "straight_line",
  "declining_balance",
  "units_of_production",
] as const

export async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_categories_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      asset_account_id INTEGER,
      accumulated_depreciation_account_id INTEGER,
      depreciation_expense_account_id INTEGER,
      gain_account_id INTEGER,
      loss_account_id INTEGER,
      default_useful_life_months INTEGER NOT NULL DEFAULT 60,
      default_salvage_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      default_depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_assets_tbl (
      id SERIAL PRIMARY KEY,
      asset_code VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      category_id INTEGER NOT NULL REFERENCES fixed_asset_categories_tbl(id),
      supplier_account_id INTEGER,
      purchase_voucher_id INTEGER,
      purchase_invoice_no VARCHAR(80),
      purchase_date DATE,
      capitalization_date DATE,
      depreciation_start_date DATE,
      cost NUMERIC(18,2) NOT NULL DEFAULT 0,
      salvage_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      useful_life_months INTEGER NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
      depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      asset_account_id INTEGER,
      accumulated_depreciation_account_id INTEGER,
      depreciation_expense_account_id INTEGER,
      gain_account_id INTEGER,
      loss_account_id INTEGER,
      cost_center_id INTEGER,
      department_id INTEGER,
      location_id INTEGER,
      responsible_employee_id INTEGER,
      serial_number VARCHAR(80),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_runs_tbl (
      id SERIAL PRIMARY KEY,
      period VARCHAR(15) NOT NULL,
      posting_date DATE NOT NULL,
      voucher_id INTEGER,
      total_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      posted_at TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_lines_tbl (
      id SERIAL PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES fixed_asset_depreciation_runs_tbl(id) ON DELETE CASCADE,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      depreciation_date DATE NOT NULL,
      depreciation_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      book_value_before NUMERIC(18,2) NOT NULL DEFAULT 0,
      book_value_after NUMERIC(18,2) NOT NULL DEFAULT 0,
      depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_transfers_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      transfer_date DATE NOT NULL,
      from_cost_center_id INTEGER,
      to_cost_center_id INTEGER,
      from_department_id INTEGER,
      to_department_id INTEGER,
      from_location_id INTEGER,
      to_location_id INTEGER,
      reason TEXT,
      voucher_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_improvements_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      improvement_date DATE NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      description TEXT,
      voucher_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS fixed_asset_disposals_tbl (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES fixed_assets_tbl(id),
      disposal_date DATE NOT NULL,
      sale_price NUMERIC(18,2) NOT NULL DEFAULT 0,
      book_value NUMERIC(18,2) NOT NULL DEFAULT 0,
      gain_loss NUMERIC(18,2) NOT NULL DEFAULT 0,
      reason TEXT,
      voucher_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_assets_category_id ON fixed_assets_tbl(category_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets_tbl(status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_run_id ON fixed_asset_depreciation_lines_tbl(run_id)`
}

export async function listFixedAssets() {
  await ensureTables()
  return sql`
    SELECT fa.*, fac.code AS category_code, fac.name AS category_name
    FROM fixed_assets_tbl fa
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fa.is_active = TRUE
    ORDER BY fa.id DESC
  `
}

export async function getFixedAssetById(id: number) {
  await ensureTables()
  const rows = await sql`
    SELECT fa.*, fac.code AS category_code, fac.name AS category_name
    FROM fixed_assets_tbl fa
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fa.id = ${id} AND fa.is_active = TRUE
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function createFixedAsset(input: Record<string, any>) {
  await ensureTables()

  const payload = {
    asset_code: String(input.asset_code || "").trim(),
    name: String(input.name || "").trim(),
    category_id: Number(input.category_id),
    cost: Number(input.cost || 0),
    salvage_value: Number(input.salvage_value || 0),
    useful_life_months: Number(input.useful_life_months || 60),
    depreciation_method: String(input.depreciation_method || "straight_line"),
    supplier_account_id: input.supplier_account_id ? Number(input.supplier_account_id) : null,
    purchase_invoice_no: input.purchase_invoice_no ? String(input.purchase_invoice_no).trim() : null,
    purchase_date: input.purchase_date || null,
    capitalization_date: input.capitalization_date || null,
    depreciation_start_date: input.depreciation_start_date || null,
    notes: input.notes ? String(input.notes).trim() : null,
    cost_center_id: input.cost_center_id ? Number(input.cost_center_id) : null,
    department_id: input.department_id ? Number(input.department_id) : null,
    location_id: input.location_id ? Number(input.location_id) : null,
    responsible_employee_id: input.responsible_employee_id ? Number(input.responsible_employee_id) : null,
    serial_number: input.serial_number ? String(input.serial_number).trim() : null,
    status: input.status || "active",
    is_active: input.is_active !== false,
  }

  if (!payload.asset_code || !payload.name || !payload.category_id || !(payload.cost >= 0)) {
    throw new Error("بيانات الأصل الثابت غير مكتملة")
  }

  const result = await sql`
    INSERT INTO fixed_assets_tbl (
      asset_code,
      name,
      category_id,
      supplier_account_id,
      purchase_invoice_no,
      purchase_date,
      capitalization_date,
      depreciation_start_date,
      cost,
      salvage_value,
      useful_life_months,
      depreciation_method,
      cost_center_id,
      department_id,
      location_id,
      responsible_employee_id,
      serial_number,
      status,
      notes,
      is_active,
      updated_at
    ) VALUES (
      ${payload.asset_code},
      ${payload.name},
      ${payload.category_id},
      ${payload.supplier_account_id},
      ${payload.purchase_invoice_no},
      ${payload.purchase_date},
      ${payload.capitalization_date},
      ${payload.depreciation_start_date},
      ${payload.cost},
      ${payload.salvage_value},
      ${payload.useful_life_months},
      ${payload.depreciation_method},
      ${payload.cost_center_id},
      ${payload.department_id},
      ${payload.location_id},
      ${payload.responsible_employee_id},
      ${payload.serial_number},
      ${payload.status},
      ${payload.notes},
      ${payload.is_active},
      CURRENT_TIMESTAMP
    ) RETURNING *
  `

  return result[0]
}

export async function updateFixedAsset(id: number, input: Record<string, any>) {
  await ensureTables()

  const current = await getFixedAssetById(id)
  if (!current) {
    throw new Error("الأصل الثابت غير موجود")
  }

  const next = {
    ...current,
    ...input,
    cost: Number(input.cost ?? current.cost ?? 0),
    salvage_value: Number(input.salvage_value ?? current.salvage_value ?? 0),
    useful_life_months: Number(input.useful_life_months ?? current.useful_life_months ?? 60),
    depreciation_method: String(input.depreciation_method ?? current.depreciation_method ?? "straight_line"),
    notes: input.notes !== undefined ? String(input.notes).trim() : current.notes,
    status: input.status ?? current.status ?? "active",
    is_active: input.is_active !== undefined ? Boolean(input.is_active) : current.is_active,
  }

  if (!next.asset_code || !next.name || !next.category_id || !(next.cost >= 0)) {
    throw new Error("بيانات الأصل الثابت غير مكتملة")
  }

  const rows = await sql`
    UPDATE fixed_assets_tbl
    SET
      asset_code = ${next.asset_code},
      name = ${next.name},
      category_id = ${next.category_id},
      supplier_account_id = ${next.supplier_account_id ?? null},
      purchase_invoice_no = ${next.purchase_invoice_no ?? null},
      purchase_date = ${next.purchase_date ?? null},
      capitalization_date = ${next.capitalization_date ?? null},
      depreciation_start_date = ${next.depreciation_start_date ?? null},
      cost = ${next.cost},
      salvage_value = ${next.salvage_value},
      useful_life_months = ${next.useful_life_months},
      depreciation_method = ${next.depreciation_method},
      cost_center_id = ${next.cost_center_id ?? null},
      department_id = ${next.department_id ?? null},
      location_id = ${next.location_id ?? null},
      responsible_employee_id = ${next.responsible_employee_id ?? null},
      serial_number = ${next.serial_number ?? null},
      status = ${next.status},
      notes = ${next.notes},
      is_active = ${next.is_active},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `

  return rows[0]
}

export async function deleteFixedAsset(id: number) {
  await ensureTables()
  const rows = await sql`
    UPDATE fixed_assets_tbl
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ?? null
}

export async function listCategories() {
  await ensureTables()
  return sql`
    SELECT *
    FROM fixed_asset_categories_tbl
    WHERE is_active = TRUE
    ORDER BY id DESC
  `
}

export async function createCategory(input: Record<string, any>) {
  await ensureTables()

  const payload = {
    code: String(input.code || "").trim(),
    name: String(input.name || "").trim(),
    asset_account_id: input.asset_account_id ? Number(input.asset_account_id) : null,
    accumulated_depreciation_account_id: input.accumulated_depreciation_account_id ? Number(input.accumulated_depreciation_account_id) : null,
    depreciation_expense_account_id: input.depreciation_expense_account_id ? Number(input.depreciation_expense_account_id) : null,
    gain_account_id: input.gain_account_id ? Number(input.gain_account_id) : null,
    loss_account_id: input.loss_account_id ? Number(input.loss_account_id) : null,
    default_useful_life_months: Number(input.default_useful_life_months || 60),
    default_salvage_value: Number(input.default_salvage_value || 0),
    default_depreciation_method: String(input.default_depreciation_method || "straight_line"),
    notes: input.notes ? String(input.notes).trim() : null,
  }

  if (!payload.code || !payload.name) {
    throw new Error("كود أو اسم التصنيف مطلوب")
  }

  const rows = await sql`
    INSERT INTO fixed_asset_categories_tbl (
      code,
      name,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      gain_account_id,
      loss_account_id,
      default_useful_life_months,
      default_salvage_value,
      default_depreciation_method,
      notes,
      is_active,
      updated_at
    ) VALUES (
      ${payload.code},
      ${payload.name},
      ${payload.asset_account_id},
      ${payload.accumulated_depreciation_account_id},
      ${payload.depreciation_expense_account_id},
      ${payload.gain_account_id},
      ${payload.loss_account_id},
      ${payload.default_useful_life_months},
      ${payload.default_salvage_value},
      ${payload.default_depreciation_method},
      ${payload.notes},
      TRUE,
      CURRENT_TIMESTAMP
    ) RETURNING *
  `

  return rows[0]
}

export function getFixedAssetDepreciationAmount(asset: Record<string, any>) {
  const cost = Number(asset.cost || 0)
  const salvageValue = Number(asset.salvage_value || 0)
  const usefulLifeMonths = Number(asset.useful_life_months || 60)
  const method = String(asset.depreciation_method || "straight_line")

  if (cost <= 0) return { amount: 0, method, bookValueBefore: 0, bookValueAfter: 0 }

  const depreciableBase = Math.max(cost - salvageValue, 0)

  if (method === "declining_balance") {
    const rate = usefulLifeMonths > 0 ? 2 / usefulLifeMonths : 0
    const amount = Math.max((cost - salvageValue) * rate / 12, 0)
    return {
      amount,
      method,
      bookValueBefore: cost,
      bookValueAfter: Math.max(cost - amount, salvageValue),
    }
  }

  if (method === "units_of_production") {
    const amount = Math.max((depreciableBase / usefulLifeMonths), 0)
    return {
      amount,
      method,
      bookValueBefore: cost,
      bookValueAfter: Math.max(cost - amount, salvageValue),
    }
  }

  const amount = Math.max(depreciableBase / usefulLifeMonths, 0)
  return {
    amount,
    method: "straight_line",
    bookValueBefore: cost,
    bookValueAfter: Math.max(cost - amount, salvageValue),
  }
}

export async function listDepreciationRuns() {
  await ensureTables()
  const runs = await sql`
    SELECT *
    FROM fixed_asset_depreciation_runs_tbl
    ORDER BY id DESC
  `

  const runsWithLines = await Promise.all(
    runs.map(async (run: any) => {
      const lines = await sql`
        SELECT fdl.*, fa.asset_code, fa.name AS asset_name
        FROM fixed_asset_depreciation_lines_tbl fdl
        LEFT JOIN fixed_assets_tbl fa ON fa.id = fdl.asset_id
        WHERE fdl.run_id = ${run.id}
        ORDER BY fdl.id
      `
      return { ...run, lines }
    }),
  )

  return runsWithLines
}

export async function getDepreciationRunById(id: number) {
  await ensureTables()
  const rows = await sql`
    SELECT *
    FROM fixed_asset_depreciation_runs_tbl
    WHERE id = ${id}
    LIMIT 1
  `

  if (!rows[0]) return null

  const lines = await sql`
    SELECT fdl.*, fa.asset_code, fa.name AS asset_name
    FROM fixed_asset_depreciation_lines_tbl fdl
    LEFT JOIN fixed_assets_tbl fa ON fa.id = fdl.asset_id
    WHERE fdl.run_id = ${id}
    ORDER BY fdl.id
  `

  return { ...rows[0], lines }
}

export async function buildFixedAssetDepreciationJournalRows(
  runId: number,
  lines: any[],
  currencyId: number | null,
  rate: number,
) {
  const rowsByAccount = new Map<string, { accountId: number; amount: number; credit_debit: 1 | 2; note: string }>()

  for (const line of lines) {
    const asset = line.asset || {}
    const category = line.category || {}
    const expenseAccountId = Number(line.expense_account_id ?? category.depreciation_expense_account_id ?? asset.depreciation_expense_account_id ?? 0)
    const accumulatedAccountId = Number(line.accumulated_account_id ?? category.accumulated_depreciation_account_id ?? asset.accumulated_depreciation_account_id ?? 0)
    const depreciationAmount = Number(line.depreciation_amount || 0)

    if (expenseAccountId > 0) {
      const key = `dr-${expenseAccountId}-debit`
      const current = rowsByAccount.get(key)
      rowsByAccount.set(key, {
        accountId: expenseAccountId,
        amount: Number((current?.amount || 0) + depreciationAmount),
        credit_debit: 1,
        note: `إهلاك أصل ثابت: ${asset.asset_code || "أصل"}`,
      })
    }

    if (accumulatedAccountId > 0) {
      const key = `cr-${accumulatedAccountId}-credit`
      const current = rowsByAccount.get(key)
      rowsByAccount.set(key, {
        accountId: accumulatedAccountId,
        amount: Number((current?.amount || 0) + depreciationAmount),
        credit_debit: 2,
        note: `إجمالي إهلاك تراكمي: ${asset.asset_code || "أصل"}`,
      })
    }
  }

  const journalRows = Array.from(rowsByAccount.values()).map((entry, index) => ({
    order_no: index + 1,
    journal_type_id: 5,
    account_id: entry.accountId,
    credit_debit: entry.credit_debit,
    amount: Number(entry.amount || 0),
    currency_id: currencyId,
    rate: Number(rate || 1),
    base_curr_amount: Number((entry.amount || 0) * (Number(rate || 1))),
    note: entry.note,
  }))

  return journalRows
}

export async function createDepreciationRun(input: Record<string, any>) {
  await ensureTables()

  const period = String(input.period || new Date().toISOString().slice(0, 7))
  const postingDate = input.posting_date || input.postingDate || new Date().toISOString().slice(0, 10)
  const shouldPost = input.create_voucher !== false && input.post_immediately !== false

  const rows = await sql`
    SELECT fa.*, fac.asset_account_id, fac.accumulated_depreciation_account_id, fac.depreciation_expense_account_id
    FROM fixed_assets_tbl fa
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fa.is_active = TRUE AND fa.status = 'active'
      AND (fa.depreciation_start_date IS NULL OR fa.depreciation_start_date <= ${postingDate}::date)
  `

  const lineInputs = rows.map((asset: any) => {
    const calc = getFixedAssetDepreciationAmount(asset)
    return {
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      depreciation_date: postingDate,
      depreciation_amount: calc.amount,
      book_value_before: calc.bookValueBefore,
      book_value_after: calc.bookValueAfter,
      depreciation_method: calc.method,
      expense_account_id: asset.depreciation_expense_account_id ?? asset.asset_account_id ?? null,
      accumulated_account_id: asset.accumulated_depreciation_account_id ?? null,
      category: {
        depreciation_expense_account_id: asset.depreciation_expense_account_id,
        accumulated_depreciation_account_id: asset.accumulated_depreciation_account_id,
      },
    }
  }).filter((line: any) => Number(line.depreciation_amount || 0) > 0)

  if (lineInputs.length === 0) {
    return { period, posting_date: postingDate, lines: [], total_depreciation: 0, voucher: null }
  }

  const totalDepreciation = lineInputs.reduce((sum: number, line: any) => sum + Number(line.depreciation_amount || 0), 0)

  const runRows = await sql`
    INSERT INTO fixed_asset_depreciation_runs_tbl (
      period,
      posting_date,
      total_depreciation,
      status,
      created_by,
      created_at
    ) VALUES (
      ${period},
      ${postingDate}::date,
      ${totalDepreciation},
      'draft',
      ${input.created_by ?? null},
      CURRENT_TIMESTAMP
    ) RETURNING *
  `

  const run = runRows[0]

  const insertionRows = await Promise.all(
    lineInputs.map(async (line: any) => sql`
      INSERT INTO fixed_asset_depreciation_lines_tbl (
        run_id,
        asset_id,
        depreciation_date,
        depreciation_amount,
        book_value_before,
        book_value_after,
        depreciation_method
      ) VALUES (
        ${run.id},
        ${line.asset_id},
        ${line.depreciation_date}::date,
        ${Number(line.depreciation_amount || 0)},
        ${Number(line.book_value_before || 0)},
        ${Number(line.book_value_after || 0)},
        ${line.depreciation_method || 'straight_line'}
      ) RETURNING *
    `),
  )

  let voucher: any = null
  if (shouldPost) {
    voucher = await postDepreciationRun(run.id, {
      branch_id: input.branch_id ?? input.branchId ?? null,
      currency_id: input.currency_id ?? input.currencyId ?? null,
      rate: input.rate ?? 1,
      voucher_code: input.voucher_code ?? null,
    })
  }

  return {
    ...run,
    lines: insertionRows.flatMap((entry) => entry),
    total_depreciation: totalDepreciation,
    voucher,
  }
}

export async function postDepreciationRun(runId: number, input: Record<string, any> = {}) {
  await ensureTables()

  const run = await getDepreciationRunById(runId)
  if (!run) {
    throw new Error("تجميع إهلاك الأصول غير موجود")
  }

  const branchId = Number(input.branch_id ?? input.branchId ?? 0) || null
  const currencyId = input.currency_id ?? input.currencyId ?? null
  const rate = Number(input.rate ?? 1)

  const lineRows = await sql`
    SELECT fdl.*, fa.asset_code, fa.name AS asset_name, fa.category_id,
           fac.accumulated_depreciation_account_id,
           fac.depreciation_expense_account_id,
           fac.asset_account_id
    FROM fixed_asset_depreciation_lines_tbl fdl
    LEFT JOIN fixed_assets_tbl fa ON fa.id = fdl.asset_id
    LEFT JOIN fixed_asset_categories_tbl fac ON fac.id = fa.category_id
    WHERE fdl.run_id = ${runId}
  `

  if (!lineRows.length) {
    throw new Error("لا توجد بنود لإهلاك هذا التجميع")
  }

  const journalRows = buildFixedAssetDepreciationJournalRows(runId, lineRows.map((line) => ({
    ...line,
    asset: { asset_code: line.asset_code, name: line.asset_name },
    category: {
      depreciation_expense_account_id: line.depreciation_expense_account_id,
      accumulated_depreciation_account_id: line.accumulated_depreciation_account_id,
    },
  })), currencyId, rate)

  if (journalRows.length === 0) {
    throw new Error("لا يمكن إنشاء قيد محاسبي للإهلاك: لا يوجد حساب مصروف/إجمالي إهلاك")
  }

  const totalDebit = journalRows.filter((row) => Number(row.credit_debit) === 1).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalCredit = journalRows.filter((row) => Number(row.credit_debit) === 2).reduce((sum, row) => sum + Number(row.amount || 0), 0)

  if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
    throw new Error("قيد إهلاك الأصول غير متوازن")
  }

  const code = String(input.voucher_code || `FA-${run.period}-${run.id}`)
  const voucherRows = await sql`
    INSERT INTO voucher_header_tbl (
      vch_type,
      vch_code,
      vch_date,
      branch_id,
      currency_id,
      rate,
      amount,
      note,
      status,
      vch_status,
      is_printed,
      insert_user
    ) VALUES (
      ${FIXED_ASSET_DEPRECIATION_VCH_TYPE},
      ${code},
      ${run.posting_date}::date,
      ${branchId},
      ${currencyId},
      ${Number(rate || 1)},
      ${Number(run.total_depreciation || 0)},
      ${`إهلاك الأصول الثابتة - ${run.period}`},
      2,
      2,
      0,
      ${input.created_by ?? null}
    ) RETURNING *
  `

  const voucher = voucherRows[0]
  await saveJournalRows(voucher.id, journalRows)

  await sql`
    UPDATE fixed_asset_depreciation_runs_tbl
    SET voucher_id = ${voucher.id}, status = 'posted', posted_at = CURRENT_TIMESTAMP
    WHERE id = ${runId}
  `

  return {
    run_id: runId,
    voucher,
    total_depreciation: Number(run.total_depreciation || 0),
    journal_rows: journalRows,
  }
}
