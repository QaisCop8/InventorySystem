import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// التسوية البنكية: كشف بنك مستورد (Excel) لحساب بنك في دليل الحسابات، تُطابَق أسطره مع أسطر قيود
// voucher_journal_detail_tbl على نفس الحساب. سطر قيد يُطابَق مرة واحدة فقط في كل التسويات (UNIQUE)،
// وسطر الكشف قد يقابل أكثر من سطر قيد (إيداع مجمّع لعدة سندات قبض).
// الإشارة: موجب = إيداع في البنك (مدين حساب البنك بدفاترنا)، سالب = سحب (دائن حساب البنك).

export const RECON_OPEN = 1
export const RECON_FINALIZED = 2

export async function ensureBankReconciliationTables() { return runSchemaOnce("lib/bank-reconciliation.ts#ensureBankReconciliationTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS bank_reconciliations_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id),
      branch_id INTEGER,
      statement_from DATE NOT NULL,
      statement_to DATE NOT NULL,
      opening_balance NUMERIC(18,3) NOT NULL DEFAULT 0,
      closing_balance NUMERIC(18,3) NOT NULL DEFAULT 0,
      note TEXT,
      file_name VARCHAR(255),
      status SMALLINT NOT NULL DEFAULT 1,
      created_by VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finalized_at TIMESTAMPTZ,
      finalized_by VARCHAR(100)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS bank_statement_lines_tbl (
      id SERIAL PRIMARY KEY,
      reconciliation_id INTEGER NOT NULL REFERENCES bank_reconciliations_tbl(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      txn_date DATE NOT NULL,
      description TEXT,
      reference VARCHAR(120),
      amount NUMERIC(18,3) NOT NULL,
      balance NUMERIC(18,3),
      journal_voucher_id INTEGER
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS bank_reconciliation_matches_tbl (
      id SERIAL PRIMARY KEY,
      reconciliation_id INTEGER NOT NULL REFERENCES bank_reconciliations_tbl(id) ON DELETE CASCADE,
      statement_line_id INTEGER NOT NULL REFERENCES bank_statement_lines_tbl(id) ON DELETE CASCADE,
      journal_detail_id INTEGER NOT NULL UNIQUE,
      match_type VARCHAR(10) NOT NULL DEFAULT 'manual',
      score INTEGER,
      created_by VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_recon ON bank_statement_lines_tbl(reconciliation_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_bank_recon_matches_line ON bank_reconciliation_matches_tbl(statement_line_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_bank_recons_account ON bank_reconciliations_tbl(account_id)`
}) }

const round = (value: number) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000
const same = (a: number, b: number, tolerance = 0.005) => Math.abs(round(a) - round(b)) <= tolerance

// مبلغ سطر القيد بعملة حساب البنك: نفس عملة الحساب ⇐ المبلغ نفسه، وإلا مبلغ الحساب المحفوظ (account_amount)
const LINE_AMOUNT_SQL = `CASE WHEN a.currency_id IS NULL OR vjd.currency_id = a.currency_id THEN ABS(vjd.amount)
  ELSE ABS(COALESCE(vjd.account_amount, vjd.amount * COALESCE(vjd.rate, 1))) END`

export type BookLine = {
  id: number
  voucher_id: number
  vch_type: number
  vch_type_name: string
  vch_code: string
  vch_date: string
  voucher_status: number
  amount: number // موجب = مدين حساب البنك (إيداع)، سالب = دائن (سحب)
  note: string
  voucher_note: string
  manual_voucher: string
  cheque_numbers: string
  branch_name: string
  statement_line_id: number | null
  reconciliation_id: number | null
}

/** أسطر قيود حساب البنك ضمن فترة (غير الملغاة)، مع حالة مطابقتها في أي تسوية. */
export async function loadBookLines(accountId: number, from: string, to: string, branchIds: number[] | null): Promise<BookLine[]> {
  const rows = await sql.unsafe(`
    SELECT vjd.id, vjd.voucher_id, vh.vch_type, COALESCE(vt.name, '') vch_type_name, vh.vch_code,
      vh.vch_date::date::text vch_date, vh.status voucher_status,
      CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * (${LINE_AMOUNT_SQL}) amount,
      COALESCE(vjd.note, '') note, COALESCE(vh.note, '') voucher_note, COALESCE(vh.manual_voucher, '') manual_voucher,
      COALESCE((SELECT string_agg(DISTINCT ch.cheq_num::text, ' ') FROM cheques_tbl ch WHERE ch.voucher_id = vh.id), '') cheque_numbers,
      COALESCE(b.branch_name, '') branch_name,
      m.statement_line_id, m.reconciliation_id
    FROM voucher_journal_detail_tbl vjd
    JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
    JOIN account_tbl a ON a.id = vjd.account_id
    LEFT JOIN voucher_types_tbl vt ON vt.id = vh.vch_type
    LEFT JOIN branches b ON b.id = vh.branch_id
    LEFT JOIN bank_reconciliation_matches_tbl m ON m.journal_detail_id = vjd.id
    WHERE vjd.account_id = $1 AND vh.status <> 3
      AND vh.vch_date >= $2::date AND vh.vch_date < ($3::date + INTERVAL '1 day')
      AND ($4::int[] IS NULL OR vh.branch_id = ANY($4::int[]))
    ORDER BY vh.vch_date, vh.id, vjd.order_no
  `, [accountId, from, to, branchIds])
  return (rows as any[]).map((row) => ({
    ...row,
    id: Number(row.id),
    voucher_id: Number(row.voucher_id),
    vch_type: Number(row.vch_type),
    voucher_status: Number(row.voucher_status),
    amount: round(Number(row.amount)),
    statement_line_id: row.statement_line_id == null ? null : Number(row.statement_line_id),
    reconciliation_id: row.reconciliation_id == null ? null : Number(row.reconciliation_id),
  }))
}

/** رصيد حساب البنك في الدفاتر حتى تاريخ (شاملاً) — بعملة الحساب، كل الفروع، السندات غير الملغاة. */
export async function bookBalanceAt(accountId: number, date: string): Promise<number> {
  const rows = await sql.unsafe(`
    SELECT COALESCE(SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * (${LINE_AMOUNT_SQL})), 0) balance
    FROM voucher_journal_detail_tbl vjd
    JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
    JOIN account_tbl a ON a.id = vjd.account_id
    WHERE vjd.account_id = $1 AND vh.status <> 3 AND vh.vch_date < ($2::date + INTERVAL '1 day')
  `, [accountId, date])
  return round(Number((rows as any[])[0]?.balance || 0))
}

/** مطابقات سندات أُلغيت لاحقاً (status=3) لا تبقى: يعود سطر الكشف غير مطابق. */
export async function pruneCancelledMatches(reconciliationId: number) {
  await sql`
    DELETE FROM bank_reconciliation_matches_tbl m
    USING voucher_journal_detail_tbl vjd, voucher_header_tbl vh
    WHERE m.reconciliation_id = ${reconciliationId} AND vjd.id = m.journal_detail_id AND vh.id = vjd.voucher_id AND vh.status = 3
  `
  await sql`
    DELETE FROM bank_reconciliation_matches_tbl m
    WHERE m.reconciliation_id = ${reconciliationId}
      AND NOT EXISTS (SELECT 1 FROM voucher_journal_detail_tbl vjd WHERE vjd.id = m.journal_detail_id)
  `
}

type StatementLine = { id: number; txn_date: string; description: string; reference: string; amount: number }

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)

const tokens = (text: string) =>
  new Set(String(text || "").toUpperCase().split(/[^A-Z0-9٠-٩]+/).filter((token) => token.length >= 3))

/** يذكر الكشف رقم السند/الشيك/المرجع اليدوي لسطر القيد؟ */
const referenceHit = (line: StatementLine, book: BookLine) => {
  const statementTokens = tokens(`${line.reference} ${line.description}`)
  if (!statementTokens.size) return false
  const bookTokens = tokens(`${book.vch_code} ${book.manual_voucher} ${book.cheque_numbers}`)
  for (const token of bookTokens) {
    if (statementTokens.has(token)) return true
    // أرقام الشيكات كثيراً ما تظهر بأصفار بادئة في الكشف (000123 ⇔ 123)
    if (/^\d+$/.test(token)) for (const candidate of statementTokens) if (/^\d+$/.test(candidate) && Number(candidate) === Number(token)) return true
  }
  return false
}

export type AutoMatchOptions = { dateToleranceDays: number; allowGroups: boolean }
export type ProposedMatch = { statementLineId: number; journalDetailIds: number[]; score: number }

/**
 * المطابقة التلقائية:
 * 1) نفس المبلغ والإشارة + رقم السند/الشيك مذكور في الكشف (ضمن ضعف مهلة التاريخ) ⇐ 100
 * 2) نفس المبلغ والإشارة ضمن مهلة التاريخ ⇐ الأقرب تاريخاً (90 − فرق الأيام). عند تساوي مرشّحَين بنفس
 *    الفرق لا يُختار أيٌّ منهما (غموض يُترك للمطابقة اليدوية).
 * 3) (اختياري) إيداع مجمّع: 2–4 أسطر قيد بنفس الإشارة ضمن المهلة مجموعها = مبلغ سطر الكشف ⇐ 70.
 */
export function proposeMatches(statementLines: StatementLine[], bookLines: BookLine[], options: AutoMatchOptions): ProposedMatch[] {
  const tolerance = Math.max(0, Math.min(60, Number(options.dateToleranceDays) || 0))
  const available = new Map(bookLines.map((line) => [line.id, line]))
  const proposals: ProposedMatch[] = []
  const pending = [...statementLines].sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.id - b.id)

  const take = (line: StatementLine, ids: number[], score: number) => {
    for (const id of ids) available.delete(id)
    proposals.push({ statementLineId: line.id, journalDetailIds: ids, score })
  }

  // المرور 1: المرجع + المبلغ
  for (const line of [...pending]) {
    const hit = [...available.values()].find((book) => same(book.amount, line.amount) && dayDiff(book.vch_date, line.txn_date) <= Math.max(tolerance * 2, 7) && referenceHit(line, book))
    if (hit) { take(line, [hit.id], 100); pending.splice(pending.indexOf(line), 1) }
  }
  // المرور 2: المبلغ + أقرب تاريخ
  for (const line of [...pending]) {
    const candidates = [...available.values()]
      .filter((book) => same(book.amount, line.amount) && dayDiff(book.vch_date, line.txn_date) <= tolerance)
      .sort((a, b) => dayDiff(a.vch_date, line.txn_date) - dayDiff(b.vch_date, line.txn_date))
    if (!candidates.length) continue
    // تساوي مرشّحَين بنفس المبلغ والفرق: أيّ اقتران يعطي نفس نتيجة التسوية، فيُؤخذ الأقدم (ترتيب السند)
    // بدرجة أقل ليظهر للمستخدم أنه اختيار بين متكافئين
    const best = candidates[0]
    const bestDiff = dayDiff(best.vch_date, line.txn_date)
    const tie = candidates.length > 1 && dayDiff(candidates[1].vch_date, line.txn_date) === bestDiff
    take(line, [best.id], Math.max(50, (tie ? 80 : 90) - Math.round(bestDiff)))
    pending.splice(pending.indexOf(line), 1)
  }
  // المرور 3: إيداع/سحب مجمّع
  if (options.allowGroups) {
    for (const line of [...pending]) {
      const pool = [...available.values()]
        .filter((book) => Math.sign(book.amount) === Math.sign(line.amount) && Math.abs(book.amount) < Math.abs(line.amount) && dayDiff(book.vch_date, line.txn_date) <= tolerance)
        .sort((a, b) => dayDiff(a.vch_date, line.txn_date) - dayDiff(b.vch_date, line.txn_date))
        .slice(0, 14)
      const found = findSubset(pool, line.amount, 4)
      if (found) { take(line, found.map((book) => book.id), 70); pending.splice(pending.indexOf(line), 1) }
    }
  }
  return proposals
}

/** أول مجموعة (2..maxSize عنصر) مجموعها = الهدف — بحث محدود (14 مرشّحاً كحد أقصى). */
function findSubset(pool: BookLine[], target: number, maxSize: number): BookLine[] | null {
  const chosen: BookLine[] = []
  const search = (start: number, remaining: number): boolean => {
    if (chosen.length >= 2 && same(remaining, 0)) return true
    if (chosen.length >= maxSize) return false
    for (let index = start; index < pool.length; index++) {
      const next = remaining - pool[index].amount
      if (Math.sign(next) !== 0 && Math.sign(next) !== Math.sign(target)) continue
      chosen.push(pool[index])
      if (search(index + 1, next)) return true
      chosen.pop()
    }
    return false
  }
  return search(0, target) ? [...chosen] : null
}

export const reconciliationSummary = (input: {
  closingBalance: number
  bookBalance: number
  statementLines: { amount: number; matched: boolean }[]
  bookLines: { amount: number; matched: boolean }[]
}) => {
  const sum = (values: number[]) => round(values.reduce((total, value) => total + value, 0))
  const unmatchedBook = input.bookLines.filter((line) => !line.matched)
  const unmatchedStatement = input.statementLines.filter((line) => !line.matched)
  // أسطر بالدفاتر لم تظهر في الكشف بعد: إيداعات بالطريق (+) وشيكات/دفعات معلّقة (−)
  const depositsInTransit = sum(unmatchedBook.filter((line) => line.amount > 0).map((line) => line.amount))
  const outstandingPayments = sum(unmatchedBook.filter((line) => line.amount < 0).map((line) => -line.amount))
  // أسطر بالكشف غير مسجّلة بالدفاتر: إيداعات/فوائد (+) وعمولات/سحوبات (−)
  const bankCredits = sum(unmatchedStatement.filter((line) => line.amount > 0).map((line) => line.amount))
  const bankDebits = sum(unmatchedStatement.filter((line) => line.amount < 0).map((line) => -line.amount))
  const adjustedBank = round(input.closingBalance + depositsInTransit - outstandingPayments)
  const adjustedBook = round(input.bookBalance + bankCredits - bankDebits)
  return {
    closing_balance: round(input.closingBalance),
    book_balance: round(input.bookBalance),
    deposits_in_transit: depositsInTransit,
    outstanding_payments: outstandingPayments,
    bank_credits_not_in_books: bankCredits,
    bank_debits_not_in_books: bankDebits,
    adjusted_bank_balance: adjustedBank,
    adjusted_book_balance: adjustedBook,
    difference: round(adjustedBank - adjustedBook),
    matched_statement_lines: input.statementLines.length - unmatchedStatement.length,
    statement_lines: input.statementLines.length,
    matched_book_lines: input.bookLines.length - unmatchedBook.length,
    book_lines: input.bookLines.length,
  }
}
