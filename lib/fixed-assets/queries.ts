import sql from "@/lib/database"
import { PURCHASE_INVOICE_VCH_TYPE } from "@/app/api/sales-vouchers/_lib"
import { round2 } from "./depreciation"

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)

async function tableExists(name: string) {
  return Boolean((await sql`SELECT to_regclass(${name}) AS name`)[0]?.name)
}

export async function loadLookups(branchIds: number[]) {
  const hasEmployees = await tableExists("employees_tbl")
  const [categories, locations, accounts, branches, costCenters, departments, currencies, employees] = await Promise.all([
    sql`
      SELECT c.*, p.name AS parent_name,
        (SELECT COUNT(*)::int FROM fa_assets_tbl a WHERE a.category_id = c.id) AS asset_count
      FROM fa_categories_tbl c LEFT JOIN fa_categories_tbl p ON p.id = c.parent_id ORDER BY c.code
    `,
    sql`
      SELECT l.*, p.name AS parent_name, (SELECT COUNT(*)::int FROM fa_assets_tbl a WHERE a.location_id = l.id) AS asset_count
      FROM fa_locations_tbl l LEFT JOIN fa_locations_tbl p ON p.id = l.parent_id ORDER BY l.code
    `,
    sql`
      SELECT a.id, a.code, a.name FROM account_tbl a
      WHERE COALESCE(a.status, 1) <> 3 AND NOT EXISTS (SELECT 1 FROM account_tbl c WHERE c.father_id = a.id)
      ORDER BY a.code
    `,
    sql`SELECT id, branch_code AS code, branch_name AS name, id = ANY(${branchIds}::int[]) AS current FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY id`,
    sql`SELECT id, name FROM cost_centers WHERE COALESCE(status, 1) <> 3 ORDER BY name`,
    sql`SELECT id, department_code AS code, department_name AS name FROM departments WHERE COALESCE(is_active, TRUE) ORDER BY department_name`,
    sql`SELECT id, currency_code AS code, currency_name AS name FROM currency ORDER BY id`,
    hasEmployees ? sql`SELECT id, employee_code AS code, full_name AS name FROM employees_tbl WHERE COALESCE(status, 1) = 1 ORDER BY full_name` : Promise.resolve([]),
  ])
  return { categories, locations, accounts, branches, costCenters, departments, currencies, employees }
}

const assetSelect = `
  SELECT a.*, c.code AS category_code, c.name AS category_name, b.branch_name, l.name AS location_name,
    cc.name AS cost_center_name, d.department_name, p.asset_no AS parent_asset_no, p.name AS parent_asset_name,
    bk.id AS book_id, COALESCE(bk.cost, a.original_cost) AS book_cost, COALESCE(bk.accumulated_depreciation, a.opening_accumulated_depreciation) AS accumulated_depreciation,
    COALESCE(bk.net_book_value, a.original_cost - a.opening_accumulated_depreciation) AS net_book_value, bk.last_depreciation_date,
    bk.depreciation_end_date, bk.remaining_life_months,
    (SELECT COUNT(*)::int FROM fa_assets_tbl ch WHERE ch.parent_asset_id = a.id) AS component_count
  FROM fa_assets_tbl a
  JOIN fa_categories_tbl c ON c.id = a.category_id
  LEFT JOIN fa_books_tbl bk ON bk.asset_id = a.id AND bk.book_type = 'ACCOUNTING'
  LEFT JOIN branches b ON b.id = a.branch_id
  LEFT JOIN fa_locations_tbl l ON l.id = a.location_id
  LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
  LEFT JOIN departments d ON d.id = a.department_id
  LEFT JOIN fa_assets_tbl p ON p.id = a.parent_asset_id
`

export async function listAssets(branchIds: number[]) {
  return sql.unsafe(`${assetSelect} WHERE a.branch_id = ANY($1::int[]) ORDER BY a.asset_no DESC`, [branchIds])
}

export async function assetCard(id: number, branchIds: number[]) {
  const asset = (await sql.unsafe(`${assetSelect} WHERE a.id = $1 AND a.branch_id = ANY($2::int[])`, [id, branchIds]))[0]
  if (!asset) return null
  const [book, schedule, transactions, components, documents, transfers, disposals] = await Promise.all([
    sql`SELECT * FROM fa_books_tbl WHERE asset_id = ${id} ORDER BY book_type`,
    sql`
      SELECT s.*, r.run_no, v.vch_code AS journal_code FROM fa_depreciation_schedule_tbl s
      LEFT JOIN fa_depreciation_runs_tbl r ON r.id = s.run_id
      LEFT JOIN voucher_header_tbl v ON v.id = s.journal_voucher_id
      WHERE s.asset_id = ${id} ORDER BY s.period, s.id
    `,
    sql`
      SELECT t.*, v.vch_code AS journal_code FROM fa_transactions_tbl t
      LEFT JOIN voucher_header_tbl v ON v.id = t.journal_voucher_id
      WHERE t.asset_id = ${id} ORDER BY t.transaction_date DESC, t.id DESC
    `,
    sql.unsafe(`${assetSelect} WHERE a.parent_asset_id = $1 ORDER BY a.asset_no`, [id]),
    sql`SELECT id, document_type, file_name, mime_type, file_size, description, document_date, expiry_date, created_at FROM fa_documents_tbl WHERE asset_id = ${id} ORDER BY id DESC`,
    sql`
      SELECT t.*, fb.branch_name AS from_branch, tb.branch_name AS to_branch, fl.name AS from_location, tl.name AS to_location,
        fc.name AS from_cost_center, tc.name AS to_cost_center
      FROM fa_transfers_tbl t
      LEFT JOIN branches fb ON fb.id = t.from_branch_id LEFT JOIN branches tb ON tb.id = t.to_branch_id
      LEFT JOIN fa_locations_tbl fl ON fl.id = t.from_location_id LEFT JOIN fa_locations_tbl tl ON tl.id = t.to_location_id
      LEFT JOIN cost_centers fc ON fc.id = t.from_cost_center_id LEFT JOIN cost_centers tc ON tc.id = t.to_cost_center_id
      WHERE t.asset_id = ${id} ORDER BY t.transfer_date DESC, t.id DESC
    `,
    sql`SELECT * FROM fa_disposals_tbl WHERE asset_id = ${id} ORDER BY id DESC`,
  ])
  return { ...asset, books: book, schedule, transactions, components, documents, transfers, disposals }
}

// Purchase-invoice lines that can still be capitalised: posted invoices, line value net of discount,
// minus what earlier assets already took from the same line.
export async function capitalizableInvoiceLines(branchIds: number[], search: string) {
  const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'voucher_items_tbl'`
  const names = new Set(columns.map((row: any) => String(row.column_name)))
  if (!names.has("item_id") || !names.has("qnty") || !names.has("journal_id")) return { supported: false, lines: [] }
  const term = `%${search.trim()}%`
  // Parameter-free fragments only: lib/database does not renumber placeholders inside fragments.
  const campaignDiscount = sql.unsafe(names.has("campaign_discount") ? "COALESCE(vi.campaign_discount, 0)" : "0")
  const lines = await sql`
    SELECT vi.id AS line_id, vh.id AS invoice_id, vh.vch_code, vh.vch_date, vh.branch_id, vh.account_id AS supplier_account_id,
      supplier.name AS supplier_name, vi.item_id, COALESCE(vi.item_name, p.product_name) AS item_name, vi.qnty AS quantity,
      ROUND(((COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0) * (1 - COALESCE(vi.discount, 0) / 100) - ${campaignDiscount}) * COALESCE(vh.rate, 1))::numeric, 2) AS line_amount,
      journal.account_id AS line_account_id, line_account.code AS line_account_code, line_account.name AS line_account_name,
      COALESCE((SELECT SUM(a.original_cost) FROM fa_assets_tbl a WHERE a.purchase_invoice_line_id = vi.id), 0) AS capitalized_amount
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    LEFT JOIN products p ON p.id = vi.item_id
    LEFT JOIN voucher_journal_detail_tbl journal ON journal.id = vi.journal_id
    LEFT JOIN account_tbl line_account ON line_account.id = journal.account_id
    LEFT JOIN account_tbl supplier ON supplier.id = vh.account_id
    WHERE vh.vch_type = ${PURCHASE_INVOICE_VCH_TYPE} AND vh.status = 2 AND vh.branch_id = ANY(${branchIds}::int[])
      AND (${search.trim()} = '' OR vh.vch_code ILIKE ${term} OR COALESCE(vi.item_name, p.product_name) ILIKE ${term} OR supplier.name ILIKE ${term})
    ORDER BY vh.vch_date DESC, vh.id DESC, vi.id
    LIMIT 300
  `
  return {
    supported: true,
    lines: lines
      .map((line: any) => ({ ...line, remaining_amount: round2(num(line.line_amount) - num(line.capitalized_amount)) }))
      .filter((line: any) => line.remaining_amount > 0.004),
  }
}

export async function dashboard(branchIds: number[], period: string) {
  const [totals, byCategory, planned, recent, runs] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.status = 'ACTIVE')::int AS active,
        COUNT(*) FILTER (WHERE a.status IN ('DRAFT', 'UNDER_CONSTRUCTION'))::int AS draft,
        COUNT(*) FILTER (WHERE a.status = 'FULLY_DEPRECIATED')::int AS fully_depreciated,
        COUNT(*) FILTER (WHERE a.status = 'SUSPENDED')::int AS suspended,
        COUNT(*) FILTER (WHERE a.status = 'DISPOSED')::int AS disposed,
        COALESCE(SUM(bk.cost) FILTER (WHERE a.status <> 'DISPOSED'), 0) AS cost,
        COALESCE(SUM(bk.accumulated_depreciation) FILTER (WHERE a.status <> 'DISPOSED'), 0) AS accumulated,
        COALESCE(SUM(bk.net_book_value) FILTER (WHERE a.status <> 'DISPOSED'), 0) AS net_book_value
      FROM fa_assets_tbl a LEFT JOIN fa_books_tbl bk ON bk.asset_id = a.id AND bk.book_type = 'ACCOUNTING'
      WHERE a.branch_id = ANY(${branchIds}::int[])
    `,
    sql`
      SELECT c.name, COUNT(a.id)::int AS count, COALESCE(SUM(bk.cost), 0) AS cost, COALESCE(SUM(bk.net_book_value), 0) AS net_book_value
      FROM fa_categories_tbl c
      JOIN fa_assets_tbl a ON a.category_id = c.id AND a.status NOT IN ('DISPOSED', 'DRAFT', 'UNDER_CONSTRUCTION') AND a.branch_id = ANY(${branchIds}::int[])
      LEFT JOIN fa_books_tbl bk ON bk.asset_id = a.id AND bk.book_type = 'ACCOUNTING'
      GROUP BY c.id, c.name ORDER BY cost DESC
    `,
    sql`
      SELECT COUNT(*)::int AS lines, COUNT(DISTINCT s.asset_id)::int AS assets, COALESCE(SUM(s.depreciation_amount), 0) AS amount, MIN(s.period) AS first_period
      FROM fa_depreciation_schedule_tbl s JOIN fa_assets_tbl a ON a.id = s.asset_id
      WHERE s.status = 'PLANNED' AND s.period <= ${period} AND a.status IN ('ACTIVE', 'FULLY_DEPRECIATED') AND a.branch_id = ANY(${branchIds}::int[])
    `,
    sql`
      SELECT t.id, t.transaction_no, t.transaction_date, t.transaction_type, t.amount, a.asset_no, a.name AS asset_name
      FROM fa_transactions_tbl t JOIN fa_assets_tbl a ON a.id = t.asset_id
      WHERE a.branch_id = ANY(${branchIds}::int[]) ORDER BY t.id DESC LIMIT 12
    `,
    sql`SELECT * FROM fa_depreciation_runs_tbl ORDER BY id DESC LIMIT 5`,
  ])
  return { totals: totals[0], byCategory, pending: planned[0], recent, runs }
}

export async function listRuns() {
  return sql`
    SELECT r.*, b.branch_name,
      (SELECT ARRAY_AGG(vch_code ORDER BY id) FROM voucher_header_tbl WHERE id = ANY(r.journal_voucher_ids)) AS journal_codes,
      (SELECT ARRAY_AGG(vch_code ORDER BY id) FROM voucher_header_tbl WHERE id = ANY(r.reversal_voucher_ids)) AS reversal_codes
    FROM fa_depreciation_runs_tbl r LEFT JOIN branches b ON b.id = r.branch_id
    ORDER BY r.id DESC LIMIT 200
  `
}

export async function runLines(runId: number) {
  return sql`
    SELECT s.period, s.depreciation_amount, s.status, a.asset_no, a.name AS asset_name, c.name AS category_name, b.branch_name
    FROM fa_depreciation_schedule_tbl s JOIN fa_assets_tbl a ON a.id = s.asset_id
    JOIN fa_categories_tbl c ON c.id = a.category_id LEFT JOIN branches b ON b.id = a.branch_id
    WHERE s.run_id = ${runId} ORDER BY a.asset_no, s.period
  `
}

// ─── reports ────────────────────────────────────────────────────────────────
export type ReportFilters = {
  branchIds: number[]
  categoryId?: number | null
  locationId?: number | null
  costCenterId?: number | null
  status?: string | null
}

const filterSql = (startIndex: number, filters: ReportFilters) => {
  const clauses = [`a.branch_id = ANY($${startIndex}::int[])`]
  const params: unknown[] = [filters.branchIds]
  const add = (clause: string, value: unknown) => { params.push(value); clauses.push(clause.replace("?", `$${startIndex + params.length - 1}`)) }
  if (filters.categoryId) add("a.category_id = ?", filters.categoryId)
  if (filters.locationId) add("a.location_id = ?", filters.locationId)
  if (filters.costCenterId) add("a.cost_center_id = ?", filters.costCenterId)
  if (filters.status) add("a.status = ?", filters.status)
  return { where: clauses.join(" AND "), params }
}

// Register as of a date, derived from the transaction history (cost_delta / accumulated_delta) so it
// is correct for past dates too, not only for today's book values.
export async function assetRegister(asOf: string, filters: ReportFilters) {
  const { where, params } = filterSql(2, filters)
  return sql.unsafe(`
    SELECT a.id, a.asset_no, a.name, a.status, a.acquisition_date, c.name AS category_name, b.branch_name, l.name AS location_name,
      cc.name AS cost_center_name, d.department_name, a.serial_number,
      COALESCE(SUM(t.cost_delta), 0) AS cost, COALESCE(SUM(t.accumulated_delta), 0) AS accumulated_depreciation,
      COALESCE(SUM(t.cost_delta), 0) - COALESCE(SUM(t.accumulated_delta), 0) AS net_book_value
    FROM fa_assets_tbl a
    JOIN fa_categories_tbl c ON c.id = a.category_id
    LEFT JOIN fa_transactions_tbl t ON t.asset_id = a.id AND t.transaction_date <= $1::date
    LEFT JOIN branches b ON b.id = a.branch_id
    LEFT JOIN fa_locations_tbl l ON l.id = a.location_id
    LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
    LEFT JOIN departments d ON d.id = a.department_id
    WHERE ${where} AND a.acquisition_date <= $1::date
    GROUP BY a.id, c.name, b.branch_name, l.name, cc.name, d.department_name
    HAVING COALESCE(SUM(t.cost_delta), 0) <> 0 OR COALESCE(SUM(t.accumulated_delta), 0) <> 0
    ORDER BY c.name, a.asset_no
  `, [asOf, ...params])
}

export async function assetMovement(from: string, to: string, filters: ReportFilters) {
  const { where, params } = filterSql(3, filters)
  return sql.unsafe(`
    SELECT c.id AS category_id, c.name AS category_name,
      COALESCE(SUM(t.cost_delta) FILTER (WHERE t.transaction_date < $1::date), 0) AS opening_cost,
      COALESCE(SUM(t.cost_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type IN ('ACQUISITION', 'OPENING_BALANCE')), 0) AS acquisitions,
      COALESCE(SUM(t.cost_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type = 'ADDITION'), 0) AS additions,
      COALESCE(SUM(t.cost_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type IN ('REVALUATION', 'IMPAIRMENT')), 0) AS revaluations,
      COALESCE(SUM(t.cost_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type = 'DISPOSAL'), 0) AS disposals_cost,
      COALESCE(SUM(t.cost_delta) FILTER (WHERE t.transaction_date <= $2::date), 0) AS closing_cost,
      COALESCE(SUM(t.accumulated_delta) FILTER (WHERE t.transaction_date < $1::date), 0) AS opening_accumulated,
      COALESCE(SUM(t.accumulated_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type IN ('DEPRECIATION', 'DEPRECIATION_REVERSAL', 'OPENING_BALANCE')), 0) AS depreciation,
      COALESCE(SUM(t.accumulated_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type = 'IMPAIRMENT'), 0) AS impairment,
      COALESCE(SUM(t.accumulated_delta) FILTER (WHERE t.transaction_date BETWEEN $1::date AND $2::date AND t.transaction_type = 'DISPOSAL'), 0) AS disposals_accumulated,
      COALESCE(SUM(t.accumulated_delta) FILTER (WHERE t.transaction_date <= $2::date), 0) AS closing_accumulated
    FROM fa_transactions_tbl t
    JOIN fa_assets_tbl a ON a.id = t.asset_id
    JOIN fa_categories_tbl c ON c.id = a.category_id
    WHERE ${where}
    GROUP BY c.id, c.name ORDER BY c.name
  `, [from, to, ...params])
}

export async function depreciationReport(fromPeriod: string, toPeriod: string, filters: ReportFilters) {
  const { where, params } = filterSql(3, filters)
  return sql.unsafe(`
    SELECT s.period, s.depreciation_date, s.depreciation_amount, s.accumulated_depreciation, s.closing_book_value, s.status,
      a.asset_no, a.name AS asset_name, c.name AS category_name, cc.name AS cost_center_name, r.run_no, v.vch_code AS journal_code
    FROM fa_depreciation_schedule_tbl s
    JOIN fa_assets_tbl a ON a.id = s.asset_id
    JOIN fa_categories_tbl c ON c.id = a.category_id
    LEFT JOIN cost_centers cc ON cc.id = a.cost_center_id
    LEFT JOIN fa_depreciation_runs_tbl r ON r.id = s.run_id
    LEFT JOIN voucher_header_tbl v ON v.id = s.journal_voucher_id
    WHERE s.status IN ('POSTED', 'PLANNED') AND s.period BETWEEN $1 AND $2 AND ${where}
    ORDER BY s.period, a.asset_no
  `, [fromPeriod, toPeriod, ...params])
}

export async function transactionReport(types: string[], from: string, to: string, filters: ReportFilters) {
  const { where, params } = filterSql(4, filters)
  return sql.unsafe(`
    SELECT t.transaction_no, t.transaction_date, t.transaction_type, t.amount, t.cost_delta, t.accumulated_delta, t.notes,
      t.old_value, t.new_value, a.asset_no, a.name AS asset_name, c.name AS category_name, v.vch_code AS journal_code,
      d.disposal_type, d.sale_amount, d.net_book_value AS disposal_nbv, d.gain_loss
    FROM fa_transactions_tbl t
    JOIN fa_assets_tbl a ON a.id = t.asset_id
    JOIN fa_categories_tbl c ON c.id = a.category_id
    LEFT JOIN voucher_header_tbl v ON v.id = t.journal_voucher_id
    LEFT JOIN fa_disposals_tbl d ON d.transaction_id = t.id
    WHERE t.transaction_type = ANY($1::text[]) AND t.transaction_date BETWEEN $2::date AND $3::date AND ${where}
    ORDER BY t.transaction_date, t.id
  `, [types, from, to, ...params])
}

export async function groupedRegister(asOf: string, groupBy: "location" | "cost_center", filters: ReportFilters) {
  const rows = await assetRegister(asOf, filters)
  const key = groupBy === "location" ? "location_name" : "cost_center_name"
  const groups = new Map<string, { name: string; count: number; cost: number; accumulated: number; nbv: number }>()
  for (const row of rows as any[]) {
    const name = row[key] || "غير محدد"
    const group = groups.get(name) ?? { name, count: 0, cost: 0, accumulated: 0, nbv: 0 }
    group.count += 1
    group.cost = round2(group.cost + num(row.cost))
    group.accumulated = round2(group.accumulated + num(row.accumulated_depreciation))
    group.nbv = round2(group.nbv + num(row.net_book_value))
    groups.set(name, group)
  }
  return { groups: [...groups.values()].sort((a, b) => b.cost - a.cost), rows }
}

// Subledger vs general ledger for every asset / accumulated-depreciation account used by categories.
export async function reconciliation(asOf: string, branchIds: number[]) {
  const sub = await sql`
    SELECT c.asset_account_id, c.accumulated_depreciation_account_id,
      COALESCE(SUM(t.cost_delta), 0) AS cost, COALESCE(SUM(t.accumulated_delta), 0) AS accumulated
    FROM fa_transactions_tbl t JOIN fa_assets_tbl a ON a.id = t.asset_id JOIN fa_categories_tbl c ON c.id = a.category_id
    WHERE t.transaction_date <= ${asOf}::date AND a.branch_id = ANY(${branchIds}::int[])
    GROUP BY c.asset_account_id, c.accumulated_depreciation_account_id
  `
  const expected = new Map<number, { subledger: number; kind: string }>()
  for (const row of sub as any[]) {
    if (row.asset_account_id) {
      const entry = expected.get(Number(row.asset_account_id)) ?? { subledger: 0, kind: "ASSET" }
      entry.subledger = round2(entry.subledger + num(row.cost))
      expected.set(Number(row.asset_account_id), entry)
    }
    if (row.accumulated_depreciation_account_id) {
      const entry = expected.get(Number(row.accumulated_depreciation_account_id)) ?? { subledger: 0, kind: "ACCUMULATED" }
      entry.subledger = round2(entry.subledger + num(row.accumulated))
      expected.set(Number(row.accumulated_depreciation_account_id), entry)
    }
  }
  const categoryAccounts = await sql`
    SELECT DISTINCT asset_account_id AS id, 'ASSET' AS kind FROM fa_categories_tbl WHERE asset_account_id IS NOT NULL
    UNION SELECT DISTINCT accumulated_depreciation_account_id, 'ACCUMULATED' FROM fa_categories_tbl WHERE accumulated_depreciation_account_id IS NOT NULL
  `
  for (const row of categoryAccounts as any[]) if (!expected.has(Number(row.id))) expected.set(Number(row.id), { subledger: 0, kind: row.kind })
  const ids = [...expected.keys()]
  if (!ids.length) return []
  const ledger = await sql`
    SELECT acc.id, acc.code, acc.name,
      COALESCE(SUM(CASE WHEN d.credit_debit = 1 THEN d.base_curr_amount ELSE -d.base_curr_amount END), 0) AS debit_balance
    FROM account_tbl acc
    LEFT JOIN voucher_journal_detail_tbl d ON d.account_id = acc.id
      AND EXISTS (SELECT 1 FROM voucher_header_tbl h WHERE h.id = d.voucher_id AND h.status = 2 AND h.vch_date <= ${asOf}::date AND h.branch_id = ANY(${branchIds}::int[]))
    WHERE acc.id = ANY(${ids}::int[])
    GROUP BY acc.id, acc.code, acc.name ORDER BY acc.code
  `
  return ledger.map((row: any) => {
    const entry = expected.get(Number(row.id))!
    const gl = entry.kind === "ASSET" ? round2(num(row.debit_balance)) : round2(-num(row.debit_balance))
    return { account_id: Number(row.id), code: row.code, name: row.name, kind: entry.kind, subledger: entry.subledger, general_ledger: gl, difference: round2(gl - entry.subledger) }
  })
}
