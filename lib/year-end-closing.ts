import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { INTERNAL_VOUCHER, createAutoJournal, getBaseCurrencyId, resolveJournalContext, round2 } from "@/lib/auto-journals"
import { ensureWorkingPeriodGuard } from "@/lib/working-period"
import { reportAmountSql } from "@/lib/report-currency"

// إقفال السنة المالية:
// 1) فحوصات: إقفال سابق لنفس السنة، سندات غير مرحّلة، قيود غير متوازنة، السنة السابقة غير مقفلة.
// 2) قيد إقفال لكل فرع بتاريخ نهاية السنة (internal_voucher_id 34): يصفّر حسابات قائمة الدخل (حسابات أصلها
//    مصنّف finanical_list_id=2 — نفس تصنيف تقرير قائمة الدخل) ويرحّل صافي الربح/الخسارة لحساب الأرباح المدورة.
//    قائمة الدخل تستثني هذا القيد فتبقى تُظهر نتيجة السنة المقفلة كما هي.
// 3) أرصدة الميزانية تنتقل للسنة الجديدة تلقائياً (الأرصدة تراكمية من كل السندات) — لا حاجة لقيد افتتاحي.
// 4) إقفال الفترة (period_locks_tbl) للسنة كاملة لكل الفروع + اختيارياً تحويل سنة العمل للسنة الجديدة.
// السنة المقفلة قد تكون خارج سنة العمل الحالية أو فيها أشهر مقفلة: تُرفع هذه القيود مؤقتاً داخل نفس المعاملة
// لإدراج قيد الإقفال ثم تُعاد كما كانت (Trigger السندات يقرأ الإعدادات داخل المعاملة نفسها).

export const YEAR_CLOSING_INTERNAL_VOUCHER = INTERNAL_VOUCHER.YEAR_CLOSING

export async function ensureYearClosingSchema() { return runSchemaOnce("lib/year-end-closing.ts#ensureYearClosingSchema", async () => {
  await ensureWorkingPeriodGuard()
  await sql`
    CREATE TABLE IF NOT EXISTS fiscal_year_closings_tbl (
      id SERIAL PRIMARY KEY,
      fiscal_year INTEGER NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      retained_account_id INTEGER NOT NULL,
      journal_voucher_ids INTEGER[] NOT NULL DEFAULT '{}',
      period_lock_id INTEGER,
      net_result NUMERIC(18,2) NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reversed_by TEXT,
      reversed_at TIMESTAMPTZ
    )
  `
}) }

export const yearRange = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` })

type AccountRow = { id: number; code: string; name: string; father_id: number | null; finanical_list_id: number | null; has_children: boolean }

/** تصنيف الحساب كما في التقارير المالية: يكفي أن يكون أحد أصوله (أو هو) مصنّفاً على القائمة المطلوبة. */
function classify(accounts: AccountRow[]) {
  const byId = new Map(accounts.map((account) => [Number(account.id), account]))
  const listsOf = (id: number) => {
    const lists = new Set<number>()
    const seen = new Set<number>()
    let current = byId.get(id)
    while (current && !seen.has(Number(current.id))) {
      seen.add(Number(current.id))
      if (current.finanical_list_id != null) lists.add(Number(current.finanical_list_id))
      current = current.father_id ? byId.get(Number(current.father_id)) : undefined
    }
    return lists
  }
  return { byId, isIncome: (id: number) => listsOf(id).has(2), isBalanceSheet: (id: number) => listsOf(id).has(1) && !listsOf(id).has(2) }
}

export type ClosingCheck = { key: string; level: "error" | "warning" | "ok"; title: string; detail?: string }

export async function previewYearClosing(year: number, retainedAccountId: number | null) {
  await ensureYearClosingSchema()
  const { from, to } = yearRange(year)
  const baseId = (await getBaseCurrencyId()) || 1
  const amount = sql.unsafe(reportAmountSql(baseId, baseId))

  const [accounts, balanceRows, existing, drafts, unbalanced, previousActivity, previousClosing, locks, branches] = await Promise.all([
    sql`SELECT a.id, a.code, a.name, a.father_id, a.finanical_list_id,
          EXISTS(SELECT 1 FROM account_tbl c WHERE c.father_id = a.id) AS has_children
        FROM account_tbl a`,
    sql`
      SELECT vjd.account_id, vh.branch_id,
        SUM(CASE WHEN vjd.credit_debit = 1 THEN ${amount} ELSE -${amount} END) AS balance
      FROM voucher_journal_detail_tbl vjd
      JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
      WHERE vh.status <> 3 AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + INTERVAL '1 day')
        AND COALESCE(vh.internal_voucher_id, 0) <> ${YEAR_CLOSING_INTERNAL_VOUCHER}
      GROUP BY vjd.account_id, vh.branch_id
    `,
    sql`SELECT id, created_at FROM fiscal_year_closings_tbl WHERE fiscal_year = ${year} AND status <> 3 LIMIT 1`,
    sql`SELECT COUNT(*)::int AS count FROM voucher_header_tbl vh
        WHERE vh.status = 1 AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + INTERVAL '1 day')`,
    sql`
      SELECT vh.id, vh.vch_code, vh.vch_type, vh.vch_date::date::text AS vch_date,
        SUM(CASE WHEN vjd.credit_debit = 1 THEN ${amount} ELSE -${amount} END) AS difference
      FROM voucher_header_tbl vh JOIN voucher_journal_detail_tbl vjd ON vjd.voucher_id = vh.id
      WHERE vh.status <> 3 AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + INTERVAL '1 day')
      GROUP BY vh.id HAVING ABS(SUM(CASE WHEN vjd.credit_debit = 1 THEN ${amount} ELSE -${amount} END)) > 0.01
      ORDER BY vh.vch_date LIMIT 50
    `,
    sql`SELECT EXISTS(SELECT 1 FROM voucher_header_tbl WHERE status <> 3 AND vch_date < ${from}::date) AS has`,
    sql`SELECT id FROM fiscal_year_closings_tbl WHERE fiscal_year = ${year - 1} AND status <> 3 LIMIT 1`,
    sql`SELECT COUNT(*)::int AS count FROM period_locks_tbl WHERE is_active AND branch_id IS NULL AND from_date <= ${from}::date AND to_date >= ${to}::date`,
    sql`SELECT id, branch_name FROM branches`,
  ])

  const { byId, isIncome, isBalanceSheet } = classify(accounts as any[])
  const branchName = new Map((branches as any[]).map((branch) => [Number(branch.id), String(branch.branch_name || "")]))

  // أسطر الإقفال لكل فرع: رصيد مدين موجب (مصروف) يُقفل دائناً، والعكس.
  const perBranch = new Map<number, { branch_id: number; branch_name: string; lines: { account_id: number; code: string; name: string; balance: number }[]; net: number }>()
  let balanceSheetDebit = 0, balanceSheetCredit = 0
  const balanceSheetByAccount = new Map<number, number>()
  for (const row of balanceRows as any[]) {
    const accountId = Number(row.account_id)
    const balance = Number(row.balance) || 0
    if (isIncome(accountId)) {
      const branchId = Number(row.branch_id) || 0
      const bucket = perBranch.get(branchId) || { branch_id: branchId, branch_name: branchName.get(branchId) || "بدون فرع", lines: [], net: 0 }
      const account = byId.get(accountId)
      const existingLine = bucket.lines.find((line) => line.account_id === accountId)
      if (existingLine) existingLine.balance += balance
      else bucket.lines.push({ account_id: accountId, code: account?.code || "", name: account?.name || "", balance })
      bucket.net += balance
      perBranch.set(branchId, bucket)
    } else if (isBalanceSheet(accountId)) {
      balanceSheetByAccount.set(accountId, (balanceSheetByAccount.get(accountId) || 0) + balance)
    }
  }
  for (const value of balanceSheetByAccount.values()) { if (value > 0) balanceSheetDebit += value; else balanceSheetCredit -= value }

  const branchesOut = [...perBranch.values()]
    .map((bucket) => ({ ...bucket, lines: bucket.lines.map((line) => ({ ...line, balance: round2(line.balance) })).filter((line) => Math.abs(line.balance) >= 0.01).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true })), net: round2(bucket.net) }))
    .filter((bucket) => bucket.lines.length)
  const revenue = round2(branchesOut.reduce((sum, bucket) => sum + bucket.lines.filter((line) => line.balance < 0).reduce((s, line) => s - line.balance, 0), 0))
  const expenses = round2(branchesOut.reduce((sum, bucket) => sum + bucket.lines.filter((line) => line.balance > 0).reduce((s, line) => s + line.balance, 0), 0))
  // صافي النتيجة: موجب = ربح
  const netResult = round2(revenue - expenses)

  const checks: ClosingCheck[] = []
  if (existing.length) checks.push({ key: "closed", level: "error", title: `السنة ${year} مقفلة مسبقاً`, detail: "تراجع عن الإقفال السابق أولاً إن أردت إعادة الإقفال" })
  const retained = retainedAccountId ? byId.get(retainedAccountId) : undefined
  if (!retainedAccountId) checks.push({ key: "retained", level: "error", title: "اختر حساب الأرباح المدورة" })
  else if (!retained) checks.push({ key: "retained", level: "error", title: "حساب الأرباح المدورة غير موجود" })
  else if ((retained as any).has_children) checks.push({ key: "retained", level: "error", title: "حساب الأرباح المدورة حساب أب", detail: "اختر حساباً فرعياً (ورقة)" })
  else if (isIncome(retainedAccountId)) checks.push({ key: "retained", level: "error", title: "حساب الأرباح المدورة من حسابات قائمة الدخل", detail: "يجب أن يكون من حسابات الميزانية (حقوق الملكية)" })
  else checks.push({ key: "retained", level: "ok", title: `حساب الأرباح المدورة: ${retained.code} - ${retained.name}` })
  if (!branchesOut.length) checks.push({ key: "empty", level: "error", title: "لا توجد أرصدة لحسابات قائمة الدخل في هذه السنة", detail: "تأكد من تصنيف الحسابات (الإيرادات والمصروفات) على قائمة الدخل في دليل الحسابات" })
  const draftCount = Number((drafts as any[])[0]?.count || 0)
  checks.push(draftCount
    ? { key: "drafts", level: "warning", title: `${draftCount} سند غير معتمد في السنة`, detail: "تدخل في الإقفال كما في التقارير المالية، وبعد الإقفال لن يمكن ترحيلها أو تعديلها — يُفضّل مراجعتها أولاً" }
    : { key: "drafts", level: "ok", title: "كل سندات السنة معتمدة" })
  checks.push((unbalanced as any[]).length
    ? { key: "unbalanced", level: "warning", title: `${(unbalanced as any[]).length} سند قيده غير متوازن`, detail: (unbalanced as any[]).slice(0, 8).map((row) => `${row.vch_code} (${row.vch_date})`).join("، ") }
    : { key: "unbalanced", level: "ok", title: "كل القيود متوازنة" })
  if ((previousActivity as any[])[0]?.has && !(previousClosing as any[]).length) checks.push({ key: "previous", level: "warning", title: `السنة ${year - 1} غير مقفلة`, detail: "يُفضّل إقفال السنوات بالترتيب" })
  if (Number((locks as any[])[0]?.count || 0)) checks.push({ key: "locked", level: "ok", title: "السنة مقفلة مسبقاً في إقفال الفترات", detail: "سيُفتح القفل مؤقتاً داخل العملية لإدراج قيد الإقفال ثم يُعاد" })

  return {
    year, from, to, base_currency_id: baseId,
    checks, can_close: !checks.some((check) => check.level === "error"),
    revenue, expenses, net_result: netResult,
    branches: branchesOut,
    balance_sheet: { accounts: [...balanceSheetByAccount.values()].filter((value) => Math.abs(value) >= 0.01).length, debit: round2(balanceSheetDebit), credit: round2(balanceSheetCredit) },
    unbalanced,
  }
}

async function settingRow(key: string) {
  return (await sql`
    SELECT id, value FROM system_settings WHERE id::text = ${key} OR description = ${key}
    ORDER BY (id::text = ${key}) DESC LIMIT 1
  `)[0] as { id: unknown; value: string | null } | undefined
}
async function setSetting(row: { id: unknown } | undefined, value: string | null) {
  if (!row) return
  await sql`UPDATE system_settings SET value = ${value} WHERE id::text = ${String(row.id)}`
}

/**
 * يفتح مؤقتاً (داخل المعاملة) سنة العمل/الأشهر وأقفال الفترات التي تغطي تواريخ السنة، ينفّذ العملية، ثم يعيدها.
 * keepLocksOpen: أقفال لا تُعاد (قفل الإقفال نفسه عند التراجع).
 */
async function withYearOpened<T>(year: number, action: () => Promise<T>, options: { finalWorkingYear?: number | null; keepLocksOpen?: number[] } = {}) {
  const { from, to } = yearRange(year)
  const yearSetting = await settingRow("working_year")
  const monthsSetting = await settingRow("working_months")
  const originalYear = yearSetting?.value ?? null
  const originalMonths = monthsSetting?.value ?? null
  await setSetting(yearSetting, String(year))
  await setSetting(monthsSetting, "")
  const locks = (await sql`
    UPDATE period_locks_tbl SET is_active = false
    WHERE is_active AND from_date <= ${to}::date AND to_date >= ${from}::date
    RETURNING id
  `) as any[]
  const result = await action()
  const restore = locks.map((lock) => Number(lock.id)).filter((id) => !(options.keepLocksOpen || []).includes(id))
  if (restore.length) await sql`UPDATE period_locks_tbl SET is_active = true WHERE id = ANY(${restore}::int[])`
  await setSetting(yearSetting, options.finalWorkingYear ? String(options.finalWorkingYear) : originalYear)
  await setSetting(monthsSetting, options.finalWorkingYear ? "" : originalMonths)
  return result
}

export class YearClosingError extends Error {}

/** يجب استدعاؤها داخل withTenantTransaction. */
export async function executeYearClosing(input: { year: number; retainedAccountId: number; userId: string; fallbackBranchId: number; lockYear: boolean; advanceWorkingYear: boolean; note?: string }) {
  const preview = await previewYearClosing(input.year, input.retainedAccountId)
  if (!preview.can_close) throw new YearClosingError(preview.checks.find((check) => check.level === "error")?.title || "لا يمكن إقفال السنة")
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`year-closing-${input.year}`}))`
  if ((await sql`SELECT 1 FROM fiscal_year_closings_tbl WHERE fiscal_year = ${input.year} AND status <> 3`).length) throw new YearClosingError(`السنة ${input.year} مقفلة مسبقاً`)

  const { from, to } = yearRange(input.year)
  const baseId = preview.base_currency_id
  const context = await resolveJournalContext(input.userId)
  const journals: { id: number; code: string; branch_name: string }[] = []

  return withYearOpened(input.year, async () => {
    for (const bucket of preview.branches) {
      const lines = bucket.lines.map((line) => ({
        accountId: line.account_id, creditDebit: (line.balance > 0 ? 2 : 1) as 1 | 2, amount: Math.abs(line.balance), currencyId: baseId, rate: 1,
        note: "إقفال حساب نتيجة",
      }))
      // ما يبقى بعد تقريب الأسطر يذهب كله لحساب الأرباح المدورة فيبقى القيد متوازناً.
      const net = round2(bucket.lines.reduce((sum, line) => sum + line.balance, 0))
      if (Math.abs(net) >= 0.01) {
        lines.push({ accountId: input.retainedAccountId, creditDebit: net > 0 ? 1 : 2, amount: Math.abs(net), currencyId: baseId, rate: 1, note: net > 0 ? "خسارة السنة" : "ربح السنة" })
      }
      if (lines.length < 2) continue
      const journal = await createAutoJournal({
        userId: input.userId, branchId: bucket.branch_id || input.fallbackBranchId, date: to, currencyId: baseId, rate: 1,
        note: `قيد إقفال السنة المالية ${input.year}${bucket.branch_name ? ` — ${bucket.branch_name}` : ""}${input.note ? ` — ${input.note}` : ""}`,
        internalVoucherId: YEAR_CLOSING_INTERNAL_VOUCHER, manualVoucher: `CLOSE-${input.year}`, lines,
      }, context)
      journals.push({ ...journal, branch_name: bucket.branch_name })
    }
    if (!journals.length) throw new YearClosingError("لا توجد أرصدة لإقفالها")

    let lockId: number | null = null
    if (input.lockYear) {
      lockId = Number(((await sql`
        INSERT INTO period_locks_tbl (branch_id, from_date, to_date, note, is_active, created_by, updated_by)
        VALUES (NULL, ${from}, ${to}, ${`إقفال السنة المالية ${input.year}`}, true, ${input.userId}, ${input.userId})
        RETURNING id
      `)[0] as any).id)
    }
    const closing = (await sql`
      INSERT INTO fiscal_year_closings_tbl (fiscal_year, from_date, to_date, retained_account_id, journal_voucher_ids, period_lock_id, net_result, status, note, created_by)
      VALUES (${input.year}, ${from}, ${to}, ${input.retainedAccountId}, ${journals.map((journal) => journal.id)}::int[], ${lockId}, ${preview.net_result}, 1, ${input.note || null}, ${input.userId})
      RETURNING id
    `)[0] as any
    return { id: Number(closing.id), journals, net_result: preview.net_result, lock_id: lockId }
  }, { finalWorkingYear: input.advanceWorkingYear ? input.year + 1 : null })
}

/** التراجع عن الإقفال: إلغاء قيود الإقفال وفتح قفل السنة. يجب استدعاؤها داخل withTenantTransaction. */
export async function reverseYearClosing(closingId: number, userId: string) {
  const closing = (await sql`SELECT * FROM fiscal_year_closings_tbl WHERE id = ${closingId} FOR UPDATE`)[0] as any
  if (!closing) throw new YearClosingError("سجل الإقفال غير موجود")
  if (Number(closing.status) === 3) throw new YearClosingError("تم التراجع عن هذا الإقفال مسبقاً")
  if ((await sql`SELECT 1 FROM fiscal_year_closings_tbl WHERE fiscal_year > ${closing.fiscal_year} AND status <> 3`).length) {
    throw new YearClosingError("توجد سنة لاحقة مقفلة — تراجع عن إقفالها أولاً")
  }
  const year = Number(closing.fiscal_year)
  const lockId = closing.period_lock_id ? Number(closing.period_lock_id) : null
  await withYearOpened(year, async () => {
    const ids = (closing.journal_voucher_ids || []).map(Number).filter(Boolean)
    if (ids.length) {
      await sql`UPDATE voucher_header_tbl SET status = 3, vch_status = 1, last_update_date = CURRENT_TIMESTAMP WHERE id = ANY(${ids}::int[]) AND status <> 3`
    }
    await sql`UPDATE fiscal_year_closings_tbl SET status = 3, reversed_by = ${userId}, reversed_at = NOW() WHERE id = ${closingId}`
  }, { keepLocksOpen: lockId ? [lockId] : [] })
}

export async function listYearClosings() {
  await ensureYearClosingSchema()
  return sql`
    SELECT f.id, f.fiscal_year, f.from_date::text AS from_date, f.to_date::text AS to_date, f.net_result, f.status, f.note,
      f.created_by, f.created_at, f.reversed_at, a.code AS retained_code, a.name AS retained_name,
      (SELECT string_agg(vh.vch_code, '، ' ORDER BY vh.id) FROM voucher_header_tbl vh WHERE vh.id = ANY(f.journal_voucher_ids)) AS journal_codes
    FROM fiscal_year_closings_tbl f LEFT JOIN account_tbl a ON a.id = f.retained_account_id
    ORDER BY f.fiscal_year DESC, f.id DESC
  `
}
