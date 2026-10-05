import sql from "@/lib/database"
import { createAutoJournal, getBaseCurrencyId, round2 } from "@/lib/auto-journals"
import { FIXED_ASSET_INTERNAL_VOUCHER } from "./schema"
import {
  addMonths, generateSchedule, isPeriod, monthsBetween, periodEnd, periodOf,
  type DepreciationMethod,
} from "./depreciation"
import {
  ACQUISITION_SOURCES, DISPOSAL_TYPES,
  type AcquisitionSource, type DisposalType, type TransactionType,
} from "./constants"

export class FixedAssetError extends Error {}

const fail = (message: string): never => { throw new FixedAssetError(message) }
const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
const optionalId = (value: unknown) => (Number(value) > 0 ? Number(value) : null)
const text = (value: unknown, max = 500) => {
  const result = String(value ?? "").trim()
  return result ? result.slice(0, max) : null
}
export const dateOnly = (value: unknown) => {
  const result = String(value ?? "").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null
}
const requireDate = (value: unknown, label: string) => dateOnly(value) ?? fail(`${label} غير صالح`)
const today = () => new Date().toISOString().slice(0, 10)
const METHODS: DepreciationMethod[] = ["STRAIGHT_LINE", "DECLINING_BALANCE", "NONE"]
const method = (value: unknown): DepreciationMethod => (METHODS.includes(value as DepreciationMethod) ? value as DepreciationMethod : "STRAIGHT_LINE")

// lib/database's sql has no object helper, and embedded fragments keep their own $n numbering, so
// dynamic column lists are built here. Column names come from this module only, never from input.
async function insertRow(table: string, values: Record<string, unknown>) {
  const columns = Object.keys(values)
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  return (await sql.unsafe(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`, Object.values(values)))[0]
}

async function updateRow(table: string, id: number, values: Record<string, unknown>) {
  const columns = Object.keys(values)
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`)
  return (await sql.unsafe(
    `UPDATE ${table} SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${columns.length + 1} RETURNING *`,
    [...Object.values(values), id],
  ))[0]
}

// ─── numbering ──────────────────────────────────────────────────────────────
async function nextCode(table: "fa_assets_tbl" | "fa_transactions_tbl" | "fa_depreciation_runs_tbl", prefix: string, width: number) {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-assets-number:${table}`}))`
  const column = table === "fa_assets_tbl" ? "asset_no" : table === "fa_transactions_tbl" ? "transaction_no" : "run_no"
  const rows = await sql.unsafe(`SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE $1`, [`${prefix}%`])
  const maximum = rows.reduce((max: number, row: any) => Math.max(max, Number(String(row.code).slice(prefix.length).match(/^(\d+)$/)?.[1] || 0)), 0)
  return `${prefix}${String(maximum + 1).padStart(width, "0")}`
}

export const nextAssetNumber = () => nextCode("fa_assets_tbl", "FA-", 5)

// ─── journal + transaction helpers ──────────────────────────────────────────
type JournalLine = { accountId: number | null | undefined; side: 1 | 2; amount: number; note: string; costCenterId?: number | null }

async function postJournal(userId: string, branchId: number, date: string, note: string, reference: string, lines: JournalLine[]) {
  const usable = lines.filter(line => round2(line.amount) > 0)
  for (const line of usable) if (!(Number(line.accountId) > 0)) fail("يجب تعريف جميع الحسابات المطلوبة للقيد في تصنيف الأصل")
  if (usable.length < 2) return null
  const currencyId = (await getBaseCurrencyId()) ?? fail("لا توجد عملة أساس معرفة")
  const journal = await createAutoJournal({
    userId,
    branchId,
    date,
    currencyId,
    rate: 1,
    note: note.slice(0, 1000),
    manualVoucher: reference,
    internalVoucherId: FIXED_ASSET_INTERNAL_VOUCHER,
    lines: usable.map(line => ({
      accountId: Number(line.accountId),
      creditDebit: line.side,
      amount: round2(line.amount),
      currencyId,
      rate: 1,
      note: line.note,
      costCenterIds: line.costCenterId ? [line.costCenterId] : undefined,
    })),
  })
  return journal.id
}

type TransactionInput = {
  assetId: number
  bookId?: number | null
  type: TransactionType
  date: string
  amount: number
  costDelta?: number
  accumulatedDelta?: number
  referenceType?: string
  referenceId?: number | null
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  journalId?: number | null
  notes?: string | null
  userId: string
}

async function recordTransaction(input: TransactionInput) {
  const transactionNo = await nextCode("fa_transactions_tbl", "FAT-", 6)
  const row = (await sql`
    INSERT INTO fa_transactions_tbl (
      asset_id, book_id, transaction_no, transaction_date, transaction_type, amount, cost_delta, accumulated_delta,
      reference_type, reference_id, old_value, new_value, journal_voucher_id, notes, created_by
    ) VALUES (
      ${input.assetId}, ${input.bookId ?? null}, ${transactionNo}, ${input.date}, ${input.type}, ${round2(input.amount)},
      ${round2(input.costDelta ?? 0)}, ${round2(input.accumulatedDelta ?? 0)}, ${input.referenceType ?? null}, ${input.referenceId ?? null},
      ${JSON.stringify(input.oldValue ?? {})}::jsonb, ${JSON.stringify(input.newValue ?? {})}::jsonb, ${input.journalId ?? null},
      ${input.notes ?? null}, ${input.userId}
    ) RETURNING id
  `)[0]
  return Number(row.id)
}

// ─── loaders ────────────────────────────────────────────────────────────────
async function lockAsset(id: number) {
  const asset = (await sql`SELECT * FROM fa_assets_tbl WHERE id = ${id} FOR UPDATE`)[0]
  return asset ?? fail("الأصل غير موجود")
}

async function categoryOf(id: number) {
  return (await sql`SELECT * FROM fa_categories_tbl WHERE id = ${id}`)[0] ?? fail("تصنيف الأصل غير موجود")
}

async function accountingBook(assetId: number, forUpdate = true) {
  const rows = forUpdate
    ? await sql`SELECT * FROM fa_books_tbl WHERE asset_id = ${assetId} AND book_type = 'ACCOUNTING' FOR UPDATE`
    : await sql`SELECT * FROM fa_books_tbl WHERE asset_id = ${assetId} AND book_type = 'ACCOUNTING'`
  return rows[0] ?? fail("لا يوجد دفتر إهلاك محاسبي لهذا الأصل — يجب تفعيل الأصل أولاً")
}

const requireStatus = (asset: any, allowed: string[], action: string) => {
  if (!allowed.includes(String(asset.status))) fail(`لا يمكن ${action} لأصل حالته ${asset.status}`)
}

// ─── schedule ───────────────────────────────────────────────────────────────
// Rebuilds every PLANNED row of a book from its current cost / accumulated depreciation, starting at
// the first period after the last posted one. Posted history is never touched.
export async function rebuildSchedule(bookId: number, options: { fromPeriod?: string } = {}) {
  const book = (await sql`SELECT * FROM fa_books_tbl WHERE id = ${bookId} FOR UPDATE`)[0] ?? fail("دفتر الإهلاك غير موجود")
  await sql`DELETE FROM fa_depreciation_schedule_tbl WHERE book_id = ${bookId} AND status = 'PLANNED'`
  const lastPosted = (await sql`
    SELECT MAX(period) AS period, COUNT(*)::int AS count FROM fa_depreciation_schedule_tbl WHERE book_id = ${bookId} AND status = 'POSTED'
  `)[0]
  const startPeriod = periodOf(dateOnly(book.depreciation_start_date) ?? today())
  const endPeriod = periodOf(dateOnly(book.depreciation_end_date) ?? today())
  let firstPeriod = lastPosted?.period ? addMonths(String(lastPosted.period), 1) : startPeriod
  if (options.fromPeriod && options.fromPeriod > firstPeriod) firstPeriod = options.fromPeriod
  const prorate = !lastPosted?.period && firstPeriod === startPeriod && Number(String(book.depreciation_start_date).slice(8, 10)) > 1
  const span = monthsBetween(firstPeriod, endPeriod) + 1
  const remaining = Math.max(1, prorate ? span - 1 : span)

  const rows = String(book.status) === "DISPOSED" ? [] : generateSchedule({
    method: method(book.depreciation_method),
    cost: num(book.cost),
    residualValue: num(book.residual_value),
    accumulatedDepreciation: num(book.accumulated_depreciation),
    remainingLifeMonths: remaining,
    usefulLifeMonths: num(book.useful_life_months, 60),
    firstPeriod,
    prorateFromDate: prorate ? dateOnly(book.depreciation_start_date) : null,
    decliningRatePercent: book.declining_rate == null ? null : num(book.declining_rate),
  })
  for (const row of rows) {
    await sql`
      INSERT INTO fa_depreciation_schedule_tbl (
        book_id, asset_id, period, depreciation_date, opening_book_value, depreciable_base,
        depreciation_amount, accumulated_depreciation, closing_book_value, status
      ) VALUES (
        ${bookId}, ${Number(book.asset_id)}, ${row.period}, ${row.depreciation_date}, ${row.opening_book_value}, ${row.depreciable_base},
        ${row.depreciation_amount}, ${row.accumulated_depreciation}, ${row.closing_book_value}, 'PLANNED'
      )
    `
  }
  const netBookValue = round2(num(book.cost) - num(book.accumulated_depreciation))
  const fully = netBookValue - num(book.residual_value) <= 0.004 && method(book.depreciation_method) !== "NONE"
  await sql`
    UPDATE fa_books_tbl SET remaining_life_months = ${rows.length ? remaining : 0}, net_book_value = ${netBookValue},
      status = CASE WHEN status = 'DISPOSED' THEN status WHEN ${fully} THEN 'FULLY_DEPRECIATED' ELSE 'ACTIVE' END, updated_at = NOW()
    WHERE id = ${bookId}
  `
  return rows.length
}

function bookEndDate(startDate: string, usefulLifeMonths: number) {
  const prorate = Number(startDate.slice(8, 10)) > 1
  return periodEnd(addMonths(periodOf(startDate), usefulLifeMonths - (prorate ? 0 : 1)))
}

async function syncAssetStatusFromBook(assetId: number) {
  const book = (await sql`SELECT status FROM fa_books_tbl WHERE asset_id = ${assetId} AND book_type = 'ACCOUNTING'`)[0]
  if (!book) return
  await sql`
    UPDATE fa_assets_tbl SET status = CASE
      WHEN status IN ('ACTIVE', 'FULLY_DEPRECIATED') AND ${book.status} = 'FULLY_DEPRECIATED' THEN 'FULLY_DEPRECIATED'
      WHEN status IN ('ACTIVE', 'FULLY_DEPRECIATED') THEN 'ACTIVE'
      ELSE status END, updated_at = NOW()
    WHERE id = ${assetId}
  `
}

// ─── master data ────────────────────────────────────────────────────────────
export type AssetInput = Record<string, unknown>

function assetPayload(input: AssetInput, category: any) {
  const cost = round2(num(input.original_cost))
  const residualPercent = num(category.default_residual_percentage)
  const residual = input.residual_value === undefined || input.residual_value === "" || input.residual_value === null
    ? round2(cost * residualPercent / 100)
    : round2(num(input.residual_value))
  const life = Math.round(num(input.useful_life_months, num(category.default_useful_life_months, 60)))
  const source = (Object.keys(ACQUISITION_SOURCES).includes(String(input.acquisition_source)) ? input.acquisition_source : "MANUAL") as AcquisitionSource
  const payload = {
    name: text(input.name, 200) ?? fail("اسم الأصل مطلوب"),
    barcode: text(input.barcode, 80),
    description: text(input.description, 2000),
    category_id: Number(category.id),
    parent_asset_id: optionalId(input.parent_asset_id),
    acquisition_source: source,
    acquisition_date: requireDate(input.acquisition_date, "تاريخ الاقتناء"),
    available_for_use_date: dateOnly(input.available_for_use_date),
    depreciation_start_date: dateOnly(input.depreciation_start_date),
    original_cost: cost,
    residual_value: residual,
    opening_accumulated_depreciation: source === "OPENING_BALANCE" ? round2(num(input.opening_accumulated_depreciation)) : 0,
    currency_id: optionalId(input.currency_id),
    exchange_rate: num(input.exchange_rate, 1) > 0 ? num(input.exchange_rate, 1) : 1,
    foreign_cost: input.foreign_cost === undefined || input.foreign_cost === "" ? null : round2(num(input.foreign_cost)),
    useful_life_months: life,
    depreciation_method: category.is_depreciable === false ? "NONE" as DepreciationMethod : method(input.depreciation_method ?? category.default_depreciation_method),
    declining_rate: input.declining_rate === undefined || input.declining_rate === "" || input.declining_rate === null
      ? (category.default_declining_rate == null ? null : num(category.default_declining_rate))
      : num(input.declining_rate),
    location_id: optionalId(input.location_id),
    department_id: optionalId(input.department_id),
    cost_center_id: optionalId(input.cost_center_id),
    custodian_employee_id: optionalId(input.custodian_employee_id),
    supplier_account_id: optionalId(input.supplier_account_id),
    credit_account_id: optionalId(input.credit_account_id),
    post_acquisition_journal: input.post_acquisition_journal !== false,
    purchase_invoice_id: optionalId(input.purchase_invoice_id),
    purchase_invoice_line_id: optionalId(input.purchase_invoice_line_id),
    serial_number: text(input.serial_number, 100),
    model: text(input.model, 100),
    manufacturer: text(input.manufacturer, 100),
    warranty_end_date: dateOnly(input.warranty_end_date),
    notes: text(input.notes, 2000),
    status: input.status === "UNDER_CONSTRUCTION" ? "UNDER_CONSTRUCTION" : "DRAFT",
  }
  if (cost < 0) fail("تكلفة الأصل لا يمكن أن تكون سالبة")
  if (residual < 0 || residual > cost) fail("القيمة المتبقية يجب أن تكون بين صفر وتكلفة الأصل")
  if (payload.opening_accumulated_depreciation < 0 || payload.opening_accumulated_depreciation > cost - residual) fail("الإهلاك المتراكم الافتتاحي أكبر من القيمة القابلة للإهلاك")
  if (!(life > 0) || life > 1200) fail("العمر الإنتاجي يجب أن يكون بين 1 و 1200 شهر")
  if (payload.declining_rate !== null && !(payload.declining_rate > 0 && payload.declining_rate <= 100)) fail("نسبة القسط المتناقص يجب أن تكون بين 0 و 100")
  const start = payload.depreciation_start_date ?? payload.available_for_use_date ?? payload.acquisition_date
  if (payload.available_for_use_date && payload.available_for_use_date < payload.acquisition_date) fail("تاريخ الجاهزية للاستخدام قبل تاريخ الاقتناء")
  if (start < payload.acquisition_date && source !== "OPENING_BALANCE") fail("تاريخ بدء الإهلاك قبل تاريخ الاقتناء")
  return payload
}

export async function createAsset(input: AssetInput, branchId: number, userId: string) {
  const category = await categoryOf(Number(input.category_id) || fail("تصنيف الأصل مطلوب"))
  if (Number(category.status) !== 1) fail("تصنيف الأصل غير فعّال")
  const payload = assetPayload(input, category)
  if (payload.parent_asset_id) await validateParent(payload.parent_asset_id, null)
  const requestedNo = text(input.asset_no, 40)
  const assetNo = requestedNo ?? await nextAssetNumber()
  if ((await sql`SELECT 1 FROM fa_assets_tbl WHERE asset_no = ${assetNo}`).length) fail("رقم الأصل مستخدم مسبقاً")
  return insertRow("fa_assets_tbl", { ...payload, asset_no: assetNo, branch_id: branchId, created_by: userId, updated_by: userId })
}

async function validateParent(parentId: number, assetId: number | null) {
  if (parentId === assetId) fail("لا يمكن أن يكون الأصل مكوّناً من نفسه")
  const parent = (await sql`SELECT id, parent_asset_id, status FROM fa_assets_tbl WHERE id = ${parentId}`)[0] ?? fail("الأصل الرئيسي غير موجود")
  if (parent.parent_asset_id) fail("الأصل الرئيسي هو مكوّن لأصل آخر — المكونات بمستوى واحد فقط")
  if (parent.status === "DISPOSED") fail("الأصل الرئيسي مستبعد")
}

export async function updateAsset(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  if (asset.status === "DISPOSED") fail("الأصل مستبعد ولا يمكن تعديله")
  const editable = asset.status === "DRAFT" || asset.status === "UNDER_CONSTRUCTION"
  const descriptive = {
    name: text(input.name, 200) ?? fail("اسم الأصل مطلوب"),
    barcode: text(input.barcode, 80),
    description: text(input.description, 2000),
    serial_number: text(input.serial_number, 100),
    model: text(input.model, 100),
    manufacturer: text(input.manufacturer, 100),
    warranty_end_date: dateOnly(input.warranty_end_date),
    notes: text(input.notes, 2000),
    updated_by: userId,
  }
  if (!editable) {
    // Financial fields of an active asset only change through transactions (additions, revaluation,
    // policy adjustment, transfer) so the history stays auditable.
    return updateRow("fa_assets_tbl", id, descriptive)
  }
  const category = await categoryOf(Number(input.category_id) || Number(asset.category_id))
  const payload = assetPayload({ ...input, status: input.status ?? asset.status }, category)
  if (payload.parent_asset_id) await validateParent(payload.parent_asset_id, id)
  const requestedNo = text(input.asset_no, 40) ?? asset.asset_no
  if (requestedNo !== asset.asset_no && (await sql`SELECT 1 FROM fa_assets_tbl WHERE asset_no = ${requestedNo} AND id <> ${id}`).length) fail("رقم الأصل مستخدم مسبقاً")
  return updateRow("fa_assets_tbl", id, { ...payload, ...descriptive, asset_no: requestedNo })
}

export async function deleteDraftAsset(id: number) {
  const asset = await lockAsset(id)
  if (!["DRAFT", "UNDER_CONSTRUCTION"].includes(asset.status)) fail("يمكن حذف الأصول المسودة فقط؛ الأصل المفعّل يُستبعد")
  if ((await sql`SELECT 1 FROM fa_assets_tbl WHERE parent_asset_id = ${id}`).length) fail("للأصل مكونات مرتبطة به")
  if ((await sql`SELECT 1 FROM fa_transactions_tbl WHERE asset_id = ${id}`).length) fail("للأصل حركات مسجلة")
  await sql`DELETE FROM fa_assets_tbl WHERE id = ${id}`
}

// ─── activation (capitalisation) ────────────────────────────────────────────
export async function activateAsset(id: number, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["DRAFT", "UNDER_CONSTRUCTION"], "تفعيل")
  const category = await categoryOf(Number(asset.category_id))
  const cost = num(asset.original_cost)
  if (cost <= 0) fail("تكلفة الأصل يجب أن تكون أكبر من صفر")
  const source = String(asset.acquisition_source) as AcquisitionSource
  const opening = source === "OPENING_BALANCE"
  const acquisitionDate = dateOnly(asset.acquisition_date)!
  const startDate = dateOnly(asset.depreciation_start_date) ?? dateOnly(asset.available_for_use_date) ?? acquisitionDate
  const openingAccumulated = num(asset.opening_accumulated_depreciation)

  let journalId: number | null = null
  if (asset.post_acquisition_journal) {
    if (!asset.credit_account_id) fail(opening ? "اختر حساب الأرصدة الافتتاحية (الطرف الدائن)" : "اختر الحساب الدائن لقيد الاقتناء (المورد أو الصندوق أو حساب الفاتورة)")
    if (!category.asset_account_id) fail("حساب الأصل غير معرف في التصنيف")
    if (opening && openingAccumulated > 0 && !category.accumulated_depreciation_account_id) fail("حساب الإهلاك المتراكم غير معرف في التصنيف")
    journalId = await postJournal(userId, Number(asset.branch_id), acquisitionDate,
      `${opening ? "رصيد افتتاحي" : "اقتناء"} أصل ثابت ${asset.asset_no} - ${asset.name}`, String(asset.asset_no), [
        { accountId: category.asset_account_id, side: 1, amount: cost, note: `تكلفة ${asset.asset_no}` },
        { accountId: category.accumulated_depreciation_account_id, side: 2, amount: opening ? openingAccumulated : 0, note: `إهلاك متراكم افتتاحي ${asset.asset_no}` },
        { accountId: asset.credit_account_id, side: 2, amount: round2(cost - (opening ? openingAccumulated : 0)), note: `${asset.asset_no} - ${asset.name}`.slice(0, 70) },
      ])
  }

  const bookMethod = category.is_depreciable === false ? "NONE" : method(asset.depreciation_method)
  const book = (await sql`
    INSERT INTO fa_books_tbl (
      asset_id, book_type, depreciation_method, cost, residual_value, useful_life_months, remaining_life_months,
      declining_rate, depreciation_start_date, depreciation_end_date, accumulated_depreciation, net_book_value, status
    ) VALUES (
      ${id}, 'ACCOUNTING', ${bookMethod}, ${cost}, ${num(asset.residual_value)}, ${num(asset.useful_life_months)}, ${num(asset.useful_life_months)},
      ${asset.declining_rate}, ${startDate}, ${bookEndDate(startDate, num(asset.useful_life_months))}, ${openingAccumulated},
      ${round2(cost - openingAccumulated)}, 'ACTIVE'
    ) RETURNING id
  `)[0]
  const bookId = Number(book.id)
  await rebuildSchedule(bookId, { fromPeriod: opening ? addMonths(periodOf(acquisitionDate), 1) : undefined })
  await sql`UPDATE fa_assets_tbl SET status = 'ACTIVE', updated_by = ${userId}, updated_at = NOW() WHERE id = ${id}`
  await syncAssetStatusFromBook(id)
  await recordTransaction({
    assetId: id, bookId, type: opening ? "OPENING_BALANCE" : "ACQUISITION", date: acquisitionDate, amount: cost,
    costDelta: cost, accumulatedDelta: opening ? openingAccumulated : 0, referenceType: asset.purchase_invoice_id ? "PURCHASE_INVOICE" : source,
    referenceId: asset.purchase_invoice_id ? Number(asset.purchase_invoice_id) : null, journalId,
    newValue: { cost, residual_value: num(asset.residual_value), useful_life_months: num(asset.useful_life_months), method: bookMethod, depreciation_start_date: startDate },
    notes: `${ACQUISITION_SOURCES[source] ?? source} — ${asset.name}`, userId,
  })
  return { journalId, bookId }
}

// ─── additions ──────────────────────────────────────────────────────────────
export async function addCapitalCost(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["ACTIVE", "FULLY_DEPRECIATED", "SUSPENDED"], "إضافة تكلفة")
  const category = await categoryOf(Number(asset.category_id))
  const book = await accountingBook(id)
  const date = requireDate(input.date, "تاريخ الإضافة")
  const amount = round2(num(input.amount))
  if (!(amount > 0)) fail("مبلغ الإضافة يجب أن يكون أكبر من صفر")
  const extend = Math.max(0, Math.round(num(input.extend_life_months)))
  const description = text(input.description, 500) ?? "إضافة رأسمالية"
  let journalId: number | null = null
  if (input.post_journal !== false) {
    const creditAccount = optionalId(input.credit_account_id) ?? fail("اختر الحساب الدائن للإضافة")
    journalId = await postJournal(userId, Number(asset.branch_id), date, `إضافة رأسمالية ${asset.asset_no}: ${description}`, String(asset.asset_no), [
      { accountId: category.asset_account_id, side: 1, amount, note: `إضافة ${asset.asset_no}` },
      { accountId: creditAccount, side: 2, amount, note: description.slice(0, 70) },
    ])
  }
  const newEnd = extend ? periodEnd(addMonths(periodOf(dateOnly(book.depreciation_end_date)!), extend)) : dateOnly(book.depreciation_end_date)
  await sql`
    UPDATE fa_books_tbl SET cost = cost + ${amount}, useful_life_months = useful_life_months + ${extend},
      depreciation_end_date = ${newEnd}, updated_at = NOW() WHERE id = ${Number(book.id)}
  `
  await rebuildSchedule(Number(book.id), { fromPeriod: periodOf(date) })
  await syncAssetStatusFromBook(id)
  const transactionId = await recordTransaction({
    assetId: id, bookId: Number(book.id), type: "ADDITION", date, amount, costDelta: amount, journalId, referenceType: "ADDITION",
    oldValue: { cost: num(book.cost), useful_life_months: num(book.useful_life_months) },
    newValue: { cost: round2(num(book.cost) + amount), useful_life_months: num(book.useful_life_months) + extend },
    notes: description, userId,
  })
  await sql`
    INSERT INTO fa_additions_tbl (asset_id, addition_date, amount, description, credit_account_id, supplier_account_id, invoice_id, extend_life_months, transaction_id)
    VALUES (${id}, ${date}, ${amount}, ${description}, ${optionalId(input.credit_account_id)}, ${optionalId(input.supplier_account_id)}, ${optionalId(input.invoice_id)}, ${extend}, ${transactionId})
  `
  return { journalId, transactionId }
}

// ─── revaluation / impairment ───────────────────────────────────────────────
export async function revalueAsset(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["ACTIVE", "FULLY_DEPRECIATED", "SUSPENDED"], "إعادة تقييم")
  const category = await categoryOf(Number(asset.category_id))
  const book = await accountingBook(id)
  const date = requireDate(input.date, "التاريخ")
  await requireDepreciationPostedBefore(Number(book.id), periodOf(date))
  const type = input.type === "IMPAIRMENT" ? "IMPAIRMENT" : "REVALUATION"
  const reason = text(input.reason, 500)
  const oldNbv = round2(num(book.cost) - num(book.accumulated_depreciation))
  let costDelta = 0
  let accumulatedDelta = 0
  let lines: JournalLine[]
  if (type === "IMPAIRMENT") {
    const loss = round2(num(input.amount))
    if (!(loss > 0) || loss > round2(oldNbv - num(book.residual_value))) fail("مبلغ انخفاض القيمة يجب أن يكون موجباً ولا يتجاوز القيمة الدفترية القابلة للإهلاك")
    accumulatedDelta = loss
    const lossAccount = optionalId(input.account_id) ?? category.impairment_loss_account_id
    lines = [
      { accountId: lossAccount, side: 1, amount: loss, note: `خسارة انخفاض قيمة ${asset.asset_no}`, costCenterId: optionalId(asset.cost_center_id) },
      { accountId: category.accumulated_depreciation_account_id, side: 2, amount: loss, note: `انخفاض قيمة ${asset.asset_no}` },
    ]
  } else {
    const newValue = round2(num(input.new_value))
    if (!(newValue >= 0)) fail("القيمة الجديدة غير صالحة")
    if (newValue < num(book.residual_value)) fail("القيمة الجديدة أقل من القيمة المتبقية للأصل")
    costDelta = round2(newValue - oldNbv)
    if (!costDelta) fail("القيمة الجديدة تساوي القيمة الدفترية الحالية")
    const reserve = optionalId(input.account_id) ?? (costDelta > 0 ? category.revaluation_reserve_account_id : category.impairment_loss_account_id)
    lines = costDelta > 0
      ? [{ accountId: category.asset_account_id, side: 1, amount: costDelta, note: `إعادة تقييم ${asset.asset_no}` }, { accountId: reserve, side: 2, amount: costDelta, note: `فائض إعادة تقييم ${asset.asset_no}` }]
      : [{ accountId: reserve, side: 1, amount: -costDelta, note: `عجز إعادة تقييم ${asset.asset_no}`, costCenterId: optionalId(asset.cost_center_id) }, { accountId: category.asset_account_id, side: 2, amount: -costDelta, note: `إعادة تقييم ${asset.asset_no}` }]
  }
  const journalId = await postJournal(userId, Number(asset.branch_id), date, `${type === "IMPAIRMENT" ? "انخفاض قيمة" : "إعادة تقييم"} أصل ${asset.asset_no}${reason ? `: ${reason}` : ""}`, String(asset.asset_no), lines)
  await sql`
    UPDATE fa_books_tbl SET cost = cost + ${costDelta}, accumulated_depreciation = accumulated_depreciation + ${accumulatedDelta}, updated_at = NOW()
    WHERE id = ${Number(book.id)}
  `
  await rebuildSchedule(Number(book.id), { fromPeriod: periodOf(date) })
  await syncAssetStatusFromBook(id)
  const newNbv = round2(oldNbv + costDelta - accumulatedDelta)
  const transactionId = await recordTransaction({
    assetId: id, bookId: Number(book.id), type, date, amount: Math.abs(costDelta || accumulatedDelta), costDelta, accumulatedDelta, journalId,
    referenceType: type, oldValue: { net_book_value: oldNbv }, newValue: { net_book_value: newNbv }, notes: reason, userId,
  })
  await sql`
    INSERT INTO fa_revaluations_tbl (asset_id, revaluation_type, revaluation_date, old_net_book_value, new_net_book_value, difference, account_id, reason, transaction_id)
    VALUES (${id}, ${type}, ${date}, ${oldNbv}, ${newNbv}, ${round2(newNbv - oldNbv)}, ${optionalId(input.account_id)}, ${reason}, ${transactionId})
  `
  return { journalId, transactionId }
}

// ─── depreciation policy adjustment ─────────────────────────────────────────
export async function adjustDepreciation(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["ACTIVE", "FULLY_DEPRECIATED", "SUSPENDED"], "تعديل سياسة الإهلاك")
  const book = await accountingBook(id)
  const date = requireDate(input.date ?? today(), "تاريخ التعديل")
  const life = Math.round(num(input.useful_life_months, num(book.useful_life_months)))
  const residual = round2(num(input.residual_value, num(book.residual_value)))
  const newMethod = method(input.depreciation_method ?? book.depreciation_method)
  const declining = input.declining_rate === undefined || input.declining_rate === "" ? book.declining_rate : num(input.declining_rate)
  if (!(life > 0) || life > 1200) fail("العمر الإنتاجي غير صالح")
  if (residual < 0 || residual > round2(num(book.cost) - num(book.accumulated_depreciation))) fail("القيمة المتبقية يجب ألا تتجاوز القيمة الدفترية الحالية")
  const startDate = dateOnly(book.depreciation_start_date)!
  const lastPosted = (await sql`SELECT MAX(period) AS period FROM fa_depreciation_schedule_tbl WHERE book_id = ${Number(book.id)} AND status = 'POSTED'`)[0]?.period
  const newEnd = bookEndDate(startDate, life)
  if (lastPosted && periodOf(newEnd) <= String(lastPosted)) fail(`العمر الجديد ينتهي قبل آخر فترة مرحّلة (${lastPosted})`)
  const old = { useful_life_months: num(book.useful_life_months), residual_value: num(book.residual_value), method: book.depreciation_method, declining_rate: book.declining_rate }
  await sql`
    UPDATE fa_books_tbl SET useful_life_months = ${life}, residual_value = ${residual}, depreciation_method = ${newMethod},
      declining_rate = ${declining}, depreciation_end_date = ${newEnd}, updated_at = NOW() WHERE id = ${Number(book.id)}
  `
  await rebuildSchedule(Number(book.id), { fromPeriod: periodOf(date) })
  await syncAssetStatusFromBook(id)
  return recordTransaction({
    assetId: id, bookId: Number(book.id), type: "DEPRECIATION_ADJUSTMENT", date, amount: 0, referenceType: "POLICY",
    oldValue: old, newValue: { useful_life_months: life, residual_value: residual, method: newMethod, declining_rate: declining },
    notes: text(input.reason, 500), userId,
  })
}

// ─── transfer ───────────────────────────────────────────────────────────────
export async function transferAsset(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["ACTIVE", "FULLY_DEPRECIATED", "SUSPENDED", "DRAFT", "UNDER_CONSTRUCTION"], "نقل")
  const date = requireDate(input.date, "تاريخ النقل")
  const pick = (key: string, current: unknown) => (input[key] === undefined ? (current == null ? null : Number(current)) : optionalId(input[key]))
  const to = {
    branch_id: pick("to_branch_id", asset.branch_id) ?? Number(asset.branch_id),
    location_id: pick("to_location_id", asset.location_id),
    department_id: pick("to_department_id", asset.department_id),
    cost_center_id: pick("to_cost_center_id", asset.cost_center_id),
    custodian_employee_id: pick("to_custodian_id", asset.custodian_employee_id),
  }
  const from = {
    branch_id: Number(asset.branch_id),
    location_id: asset.location_id == null ? null : Number(asset.location_id),
    department_id: asset.department_id == null ? null : Number(asset.department_id),
    cost_center_id: asset.cost_center_id == null ? null : Number(asset.cost_center_id),
    custodian_employee_id: asset.custodian_employee_id == null ? null : Number(asset.custodian_employee_id),
  }
  if (JSON.stringify(from) === JSON.stringify(to)) fail("لم يتغير أي من بيانات الموقع")
  await updateRow("fa_assets_tbl", id, { ...to, updated_by: userId })
  const reason = text(input.reason, 500)
  const transactionId = await recordTransaction({ assetId: id, type: "TRANSFER", date, amount: 0, referenceType: "TRANSFER", oldValue: from, newValue: to, notes: reason, userId })
  await sql`
    INSERT INTO fa_transfers_tbl (
      asset_id, transfer_date, from_branch_id, to_branch_id, from_location_id, to_location_id, from_department_id, to_department_id,
      from_cost_center_id, to_cost_center_id, from_custodian_id, to_custodian_id, reason, created_by, approved_by, transaction_id
    ) VALUES (
      ${id}, ${date}, ${from.branch_id}, ${to.branch_id}, ${from.location_id}, ${to.location_id}, ${from.department_id}, ${to.department_id},
      ${from.cost_center_id}, ${to.cost_center_id}, ${from.custodian_employee_id}, ${to.custodian_employee_id}, ${reason}, ${userId}, ${userId}, ${transactionId}
    )
  `
  return transactionId
}

// ─── suspend / resume ───────────────────────────────────────────────────────
export async function suspendAsset(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["ACTIVE"], "إيقاف")
  const book = await accountingBook(id)
  const date = requireDate(input.date ?? today(), "تاريخ الإيقاف")
  const remaining = (await sql`SELECT COUNT(*)::int AS count FROM fa_depreciation_schedule_tbl WHERE book_id = ${Number(book.id)} AND status = 'PLANNED'`)[0]
  await sql`DELETE FROM fa_depreciation_schedule_tbl WHERE book_id = ${Number(book.id)} AND status = 'PLANNED' AND period >= ${periodOf(date)}`
  await sql`UPDATE fa_books_tbl SET remaining_life_months = ${Number(remaining?.count || 0)}, updated_at = NOW() WHERE id = ${Number(book.id)}`
  await sql`UPDATE fa_assets_tbl SET status = 'SUSPENDED', updated_by = ${userId}, updated_at = NOW() WHERE id = ${id}`
  return recordTransaction({ assetId: id, bookId: Number(book.id), type: "SUSPENSION", date, amount: 0, notes: text(input.reason, 500), userId })
}

export async function resumeAsset(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["SUSPENDED"], "استئناف")
  const book = await accountingBook(id)
  const date = requireDate(input.date ?? today(), "تاريخ الاستئناف")
  const from = periodOf(date)
  const remaining = Math.max(1, num(book.remaining_life_months, 1))
  await sql`DELETE FROM fa_depreciation_schedule_tbl WHERE book_id = ${Number(book.id)} AND status = 'PLANNED'`
  await sql`UPDATE fa_books_tbl SET depreciation_end_date = ${periodEnd(addMonths(from, remaining - 1))}, updated_at = NOW() WHERE id = ${Number(book.id)}`
  await sql`UPDATE fa_assets_tbl SET status = 'ACTIVE', updated_by = ${userId}, updated_at = NOW() WHERE id = ${id}`
  await rebuildSchedule(Number(book.id), { fromPeriod: from })
  await syncAssetStatusFromBook(id)
  return recordTransaction({ assetId: id, bookId: Number(book.id), type: "RESUMPTION", date, amount: 0, notes: text(input.reason, 500), userId })
}

// ─── disposal ───────────────────────────────────────────────────────────────
async function requireDepreciationPostedBefore(bookId: number, period: string) {
  const pending = (await sql`
    SELECT COUNT(*)::int AS count, MIN(period) AS first FROM fa_depreciation_schedule_tbl
    WHERE book_id = ${bookId} AND status = 'PLANNED' AND period < ${period}
  `)[0]
  if (Number(pending?.count) > 0) fail(`يوجد إهلاك غير مرحّل منذ الفترة ${pending.first} — رحّل الإهلاك حتى الشهر السابق أولاً`)
}

export async function disposeAsset(id: number, input: AssetInput, userId: string) {
  const asset = await lockAsset(id)
  requireStatus(asset, ["ACTIVE", "FULLY_DEPRECIATED", "SUSPENDED"], "استبعاد")
  if ((await sql`SELECT 1 FROM fa_assets_tbl WHERE parent_asset_id = ${id} AND status <> 'DISPOSED'`).length) fail("يجب استبعاد مكونات الأصل أولاً")
  const category = await categoryOf(Number(asset.category_id))
  const book = await accountingBook(id)
  const date = requireDate(input.date, "تاريخ الاستبعاد")
  await requireDepreciationPostedBefore(Number(book.id), periodOf(date))
  const type = (Object.keys(DISPOSAL_TYPES).includes(String(input.disposal_type)) ? input.disposal_type : "SALE") as DisposalType
  const saleAmount = type === "SALE" ? round2(num(input.sale_amount)) : 0
  if (saleAmount < 0) fail("قيمة البيع لا يمكن أن تكون سالبة")
  const proceedsAccount = saleAmount > 0 ? (optionalId(input.proceeds_account_id) ?? fail("اختر حساب المتحصلات (الصندوق أو العميل)")) : null
  const cost = round2(num(book.cost))
  const accumulated = round2(num(book.accumulated_depreciation))
  const nbv = round2(cost - accumulated)
  const gainLoss = round2(saleAmount - nbv)
  const reason = text(input.reason, 500)
  const costCenterId = optionalId(asset.cost_center_id)
  const journalId = await postJournal(userId, Number(asset.branch_id), date, `استبعاد أصل ${asset.asset_no} (${DISPOSAL_TYPES[type]})${reason ? `: ${reason}` : ""}`, String(asset.asset_no), [
    { accountId: proceedsAccount, side: 1, amount: saleAmount, note: `متحصلات ${asset.asset_no}` },
    { accountId: category.accumulated_depreciation_account_id, side: 1, amount: accumulated, note: `إهلاك متراكم ${asset.asset_no}` },
    { accountId: category.loss_on_disposal_account_id, side: 1, amount: gainLoss < 0 ? -gainLoss : 0, note: `خسارة استبعاد ${asset.asset_no}`, costCenterId },
    { accountId: category.asset_account_id, side: 2, amount: cost, note: `تكلفة ${asset.asset_no}` },
    { accountId: category.gain_on_disposal_account_id, side: 2, amount: gainLoss > 0 ? gainLoss : 0, note: `ربح استبعاد ${asset.asset_no}`, costCenterId },
  ])
  await sql`DELETE FROM fa_depreciation_schedule_tbl WHERE book_id = ${Number(book.id)} AND status = 'PLANNED'`
  await sql`UPDATE fa_books_tbl SET status = 'DISPOSED', remaining_life_months = 0, net_book_value = 0, updated_at = NOW() WHERE id = ${Number(book.id)}`
  await sql`UPDATE fa_assets_tbl SET status = 'DISPOSED', updated_by = ${userId}, updated_at = NOW() WHERE id = ${id}`
  const transactionId = await recordTransaction({
    assetId: id, bookId: Number(book.id), type: "DISPOSAL", date, amount: saleAmount, costDelta: -cost, accumulatedDelta: -accumulated, journalId,
    referenceType: type, oldValue: { cost, accumulated_depreciation: accumulated, net_book_value: nbv }, newValue: { sale_amount: saleAmount, gain_loss: gainLoss },
    notes: reason, userId,
  })
  await sql`
    INSERT INTO fa_disposals_tbl (
      asset_id, disposal_date, disposal_type, sale_amount, proceeds_account_id, customer_account_id, invoice_id,
      cost_at_disposal, accumulated_depreciation, net_book_value, gain_loss, journal_voucher_id, reason, transaction_id, created_by
    ) VALUES (
      ${id}, ${date}, ${type}, ${saleAmount}, ${proceedsAccount}, ${optionalId(input.customer_account_id)}, ${optionalId(input.invoice_id)},
      ${cost}, ${accumulated}, ${nbv}, ${gainLoss}, ${journalId}, ${reason}, ${transactionId}, ${userId}
    )
  `
  return { journalId, transactionId, gainLoss, netBookValue: nbv }
}

// ─── depreciation runs ──────────────────────────────────────────────────────
export type RunFilter = { period: string; bookType?: string; branchIds: number[] }

export async function depreciationCandidates(filter: RunFilter) {
  if (!isPeriod(filter.period)) fail("الفترة يجب أن تكون بصيغة YYYY-MM")
  return sql`
    SELECT s.id, s.period, s.depreciation_date, s.depreciation_amount, s.opening_book_value, s.closing_book_value, s.book_id,
      a.id AS asset_id, a.asset_no, a.name AS asset_name, a.branch_id, a.cost_center_id, b.branch_name,
      c.id AS category_id, c.name AS category_name, c.depreciation_expense_account_id, c.accumulated_depreciation_account_id,
      bk.cost
    FROM fa_depreciation_schedule_tbl s
    JOIN fa_books_tbl bk ON bk.id = s.book_id
    JOIN fa_assets_tbl a ON a.id = s.asset_id
    JOIN fa_categories_tbl c ON c.id = a.category_id
    LEFT JOIN branches b ON b.id = a.branch_id
    WHERE s.status = 'PLANNED' AND s.period <= ${filter.period} AND bk.book_type = ${filter.bookType ?? "ACCOUNTING"}
      AND a.status IN ('ACTIVE', 'FULLY_DEPRECIATED') AND a.branch_id = ANY(${filter.branchIds}::int[])
    ORDER BY a.branch_id, a.asset_no, s.period
  `
}

export async function postDepreciationRun(filter: RunFilter & { postingDate: string; notes?: string }, userId: string) {
  const postingDate = requireDate(filter.postingDate, "تاريخ الترحيل")
  if (periodOf(postingDate) < filter.period) fail("تاريخ الترحيل يجب أن يكون ضمن الفترة أو بعدها")
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-assets-depreciation:${filter.bookType ?? "ACCOUNTING"}`}))`
  const lines = await depreciationCandidates(filter)
  if (!lines.length) fail("لا يوجد إهلاك مخطط غير مرحّل حتى هذه الفترة")
  const missing = lines.find((line: any) => !line.depreciation_expense_account_id || !line.accumulated_depreciation_account_id)
  if (missing) fail(`حسابات الإهلاك غير معرفة في التصنيف "${missing.category_name}"`)
  await sql`SELECT id FROM fa_depreciation_schedule_tbl WHERE id = ANY(${lines.map((line: any) => Number(line.id))}::bigint[]) FOR UPDATE`

  const runNo = await nextCode("fa_depreciation_runs_tbl", "FDR-", 5)
  const total = round2(lines.reduce((sum: number, line: any) => sum + num(line.depreciation_amount), 0))
  const assetIds = new Set(lines.map((line: any) => Number(line.asset_id)))
  const run = (await sql`
    INSERT INTO fa_depreciation_runs_tbl (run_no, period, book_type, posting_date, branch_id, total_amount, asset_count, status, notes, created_by)
    VALUES (${runNo}, ${filter.period}, ${filter.bookType ?? "ACCOUNTING"}, ${postingDate}, ${filter.branchIds.length === 1 ? filter.branchIds[0] : null},
      ${total}, ${assetIds.size}, 'POSTED', ${text(filter.notes, 500)}, ${userId})
    RETURNING id
  `)[0]
  const runId = Number(run.id)

  const journalByBranch = new Map<number, number | null>()
  const branches: number[] = [...new Set<number>(lines.map((line: any) => Number(line.branch_id)))]
  for (const branchId of branches) {
    const branchLines = lines.filter((line: any) => Number(line.branch_id) === branchId)
    const grouped = new Map<string, JournalLine>()
    for (const line of branchLines) {
      const amount = num(line.depreciation_amount)
      const expenseKey = `d:${line.depreciation_expense_account_id}:${line.cost_center_id ?? 0}`
      const creditKey = `c:${line.accumulated_depreciation_account_id}`
      const debit = grouped.get(expenseKey) ?? { accountId: Number(line.depreciation_expense_account_id), side: 1, amount: 0, note: `مصروف إهلاك ${filter.period}`, costCenterId: optionalId(line.cost_center_id) }
      debit.amount = round2(debit.amount + amount)
      grouped.set(expenseKey, debit)
      const credit = grouped.get(creditKey) ?? { accountId: Number(line.accumulated_depreciation_account_id), side: 2, amount: 0, note: `مجمع إهلاك ${filter.period}` }
      credit.amount = round2(credit.amount + amount)
      grouped.set(creditKey, credit)
    }
    const journalId = await postJournal(userId, branchId, postingDate, `إهلاك الأصول الثابتة ${filter.period} — ${runNo}`, runNo, [...grouped.values()])
    journalByBranch.set(branchId, journalId)
  }
  await sql`UPDATE fa_depreciation_runs_tbl SET journal_voucher_ids = ${[...journalByBranch.values()].filter(Boolean) as number[]}::int[] WHERE id = ${runId}`

  const byAsset = new Map<number, { bookId: number; amount: number; branchId: number; lastDate: string }>()
  for (const line of lines) {
    const journalId = journalByBranch.get(Number(line.branch_id)) ?? null
    await sql`
      UPDATE fa_depreciation_schedule_tbl SET status = 'POSTED', run_id = ${runId}, journal_voucher_id = ${journalId}, posted_at = NOW(), posted_by = ${userId}
      WHERE id = ${Number(line.id)}
    `
    const entry = byAsset.get(Number(line.asset_id)) ?? { bookId: Number(line.book_id), amount: 0, branchId: Number(line.branch_id), lastDate: "" }
    entry.amount = round2(entry.amount + num(line.depreciation_amount))
    const lineDate = dateOnly(line.depreciation_date) ?? postingDate
    if (lineDate > entry.lastDate) entry.lastDate = lineDate
    byAsset.set(Number(line.asset_id), entry)
  }
  for (const [assetId, entry] of byAsset) {
    await sql`
      UPDATE fa_books_tbl SET accumulated_depreciation = accumulated_depreciation + ${entry.amount},
        net_book_value = cost - (accumulated_depreciation + ${entry.amount}), last_depreciation_date = ${entry.lastDate},
        status = CASE WHEN NOT EXISTS (SELECT 1 FROM fa_depreciation_schedule_tbl WHERE book_id = ${entry.bookId} AND status = 'PLANNED') THEN 'FULLY_DEPRECIATED' ELSE status END,
        updated_at = NOW()
      WHERE id = ${entry.bookId}
    `
    await syncAssetStatusFromBook(assetId)
    await recordTransaction({
      assetId, bookId: entry.bookId, type: "DEPRECIATION", date: postingDate, amount: entry.amount, accumulatedDelta: entry.amount,
      referenceType: "DEPRECIATION_RUN", referenceId: runId, journalId: journalByBranch.get(entry.branchId) ?? null, notes: `${runNo} — ${filter.period}`, userId,
    })
  }
  return { runId, runNo, total, assetCount: assetIds.size, journalIds: [...journalByBranch.values()].filter(Boolean) }
}

export async function reverseDepreciationRun(runId: number, userId: string, date?: string) {
  const run = (await sql`SELECT * FROM fa_depreciation_runs_tbl WHERE id = ${runId} FOR UPDATE`)[0] ?? fail("تشغيل الإهلاك غير موجود")
  if (run.status !== "POSTED") fail("التشغيل معكوس مسبقاً")
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`fixed-assets-depreciation:${run.book_type}`}))`
  const later = (await sql`
    SELECT 1 FROM fa_depreciation_schedule_tbl later
    JOIN fa_depreciation_schedule_tbl mine ON mine.book_id = later.book_id AND mine.run_id = ${runId}
    WHERE later.status = 'POSTED' AND later.run_id <> ${runId} AND later.period > mine.period LIMIT 1
  `)[0]
  if (later) fail("توجد تشغيلات إهلاك لاحقة على نفس الأصول — اعكسها أولاً")
  const blocked = (await sql`
    SELECT a.asset_no FROM fa_depreciation_schedule_tbl s JOIN fa_assets_tbl a ON a.id = s.asset_id
    WHERE s.run_id = ${runId} AND a.status = 'DISPOSED' LIMIT 1
  `)[0]
  if (blocked) fail(`الأصل ${blocked.asset_no} مستبعد بعد هذا الإهلاك ولا يمكن عكسه`)
  const reversalDate = dateOnly(date) ?? today()

  const reversalIds: number[] = []
  for (const voucherId of (run.journal_voucher_ids as number[]) || []) {
    const header = (await sql`SELECT branch_id, vch_code FROM voucher_header_tbl WHERE id = ${voucherId}`)[0]
    const details = await sql`
      SELECT d.account_id, d.credit_debit, d.amount, d.note, ARRAY_REMOVE(ARRAY_AGG(c.cost_center_id), NULL) AS cost_centers
      FROM voucher_journal_detail_tbl d LEFT JOIN voucher_costcenter_tbl c ON c.voucher_journal_id = d.id
      WHERE d.voucher_id = ${voucherId} GROUP BY d.id ORDER BY d.order_no
    `
    const reversalId = await postJournal(userId, Number(header?.branch_id), reversalDate, `عكس إهلاك ${run.run_no} (${header?.vch_code ?? voucherId})`, String(run.run_no),
      details.map((detail: any) => ({
        accountId: Number(detail.account_id),
        side: Number(detail.credit_debit) === 1 ? 2 : 1,
        amount: num(detail.amount),
        note: `عكس: ${String(detail.note || "").slice(0, 60)}`,
        costCenterId: Array.isArray(detail.cost_centers) && detail.cost_centers[0] ? Number(detail.cost_centers[0]) : null,
      })))
    if (reversalId) reversalIds.push(reversalId)
  }

  const rows = await sql`SELECT * FROM fa_depreciation_schedule_tbl WHERE run_id = ${runId} AND status = 'POSTED'`
  const byBook = new Map<number, { assetId: number; amount: number }>()
  for (const row of rows) {
    await sql`UPDATE fa_depreciation_schedule_tbl SET status = 'REVERSED' WHERE id = ${Number(row.id)}`
    const entry = byBook.get(Number(row.book_id)) ?? { assetId: Number(row.asset_id), amount: 0 }
    entry.amount = round2(entry.amount + num(row.depreciation_amount))
    byBook.set(Number(row.book_id), entry)
  }
  for (const [bookId, entry] of byBook) {
    const last = (await sql`SELECT MAX(depreciation_date) AS date FROM fa_depreciation_schedule_tbl WHERE book_id = ${bookId} AND status = 'POSTED'`)[0]?.date
    await sql`
      UPDATE fa_books_tbl SET accumulated_depreciation = accumulated_depreciation - ${entry.amount}, last_depreciation_date = ${dateOnly(last)},
        status = CASE WHEN status = 'DISPOSED' THEN status ELSE 'ACTIVE' END, updated_at = NOW()
      WHERE id = ${bookId}
    `
    await rebuildSchedule(bookId)
    await syncAssetStatusFromBook(entry.assetId)
    await recordTransaction({
      assetId: entry.assetId, bookId, type: "DEPRECIATION_REVERSAL", date: reversalDate, amount: entry.amount, accumulatedDelta: -entry.amount,
      referenceType: "DEPRECIATION_RUN", referenceId: runId, journalId: reversalIds[0] ?? null, notes: `عكس ${run.run_no}`, userId,
    })
  }
  await sql`
    UPDATE fa_depreciation_runs_tbl SET status = 'REVERSED', reversal_voucher_ids = ${reversalIds}::int[], reversed_by = ${userId}, reversed_at = NOW()
    WHERE id = ${runId}
  `
  return { reversalIds }
}
